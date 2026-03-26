import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  AuctionStatus,
  DisputeStatus,
  KycStatus,
  LotStatus,
  PayoutStatus,
  TransactionStatus,
  UserRole,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from './payment-provider.interface';
import { EventService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly prisma: PrismaService,
    private readonly events: EventService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
    @InjectQueue('payment') private readonly paymentQueue: Queue,
  ) {}

  async ensureWalletForUser(userId: string): Promise<void> {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!u) throw new NotFoundException('User not found');
    if (u.mangopayUserId && u.mangopayWalletId) return;

    const pu = await this.provider.createUser({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      userType: u.userType,
      countryCode: u.countryCode,
      companyName: u.companyName ?? undefined,
      vatNumber: u.vatNumber ?? undefined,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mangopayUserId: pu.externalUserId,
        mangopayWalletId: pu.walletId,
      },
    });
  }

  async assertBidAllowed(userId: string, amountCents: number): Promise<void> {
    await this.ensureWalletForUser(userId);
    const u = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!u) throw new NotFoundException('User not found');

    if (!u.cardValidated) {
      throw new ForbiddenException({
        code: 'CARD_VALIDATION_REQUIRED',
        message: 'Please validate a payment card before bidding',
        action: '/dashboard/payment/validate-card',
      });
    }

    if (amountCents > 1_000_000 && u.kycStatus !== KycStatus.VERIFIED) {
      throw new ForbiddenException({
        code: 'KYC_REQUIRED',
        message: 'Identity verification required for bids over €10,000',
        action: '/dashboard/kyc',
      });
    }
  }

  async getTransactionForParticipant(transactionId: string, userId: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: {
        id: transactionId,
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      include: {
        lot: { select: { id: true, title: true, slug: true } },
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        dispute: true,
        payout: true,
      },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async getPaymentDetails(transactionId: string, userId: string) {
    const tx = await this.getTransactionForParticipant(transactionId, userId);
    if (tx.buyerId !== userId) {
      throw new ForbiddenException('Only the buyer can view payment details');
    }
    await this.ensureWalletForUser(userId);
    const buyer = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!buyer.mangopayUserId || !buyer.mangopayWalletId) {
      throw new BadRequestException('Payment wallet not ready');
    }

    if (!tx.mangopayPayInId) {
      const wire = await this.provider.createBankWirePayIn(
        buyer.mangopayUserId,
        buyer.mangopayWalletId,
        tx.totalAmount,
        `tx-${tx.id}`,
      );
      await this.prisma.transaction.update({
        where: { id: tx.id },
        data: { mangopayPayInId: wire.payInId },
      });
      return wire;
    }

    return {
      payInId: tx.mangopayPayInId,
      bankName: 'See your Mangopay dashboard',
      iban: '—',
      bic: '—',
      wireReference: tx.mangopayPayInId,
    };
  }

  async processPayInSucceeded(payInId: string): Promise<void> {
    const tx = await this.prisma.transaction.findFirst({
      where: { mangopayPayInId: payInId },
      include: { lot: { select: { title: true, slug: true } } },
    });
    if (!tx) return;
    if (tx.status !== TransactionStatus.AWAITING_PAYMENT) return;

    const inspectionDeadline = new Date(Date.now() + 72 * 3600 * 1000);
    await this.prisma.transaction.update({
      where: { id: tx.id },
      data: {
        status: TransactionStatus.INSPECTION_WINDOW,
        paymentReceivedAt: new Date(),
        inspectionDeadline,
      },
    });

    await this.notifications.notify({
      userId: tx.buyerId,
      title: 'Payment received',
      body: 'Your payment was received. Please inspect the equipment within 72 hours.',
      type: 'payment.received',
      metadata: { transactionId: tx.id, lotId: tx.lotId },
      sendEmail: true,
      emailTemplate: 'payment_received',
      emailData: {
        lotTitle: tx.lot.title,
        amount: tx.totalAmount,
      },
    });

    const delay = inspectionDeadline.getTime() - Date.now();
    await this.paymentQueue.add(
      'inspection:deadline',
      { transactionId: tx.id },
      {
        jobId: `inspection-deadline-${tx.id}`,
        delay: Math.max(0, delay),
      },
    );

    this.events.log({
      type: 'transaction.payment_received',
      entityId: tx.id,
      entityType: 'transaction',
      payload: { payInId },
    });
  }

  async handleNonPayment(transactionId: string): Promise<void> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        lot: { select: { id: true, title: true, slug: true } },
        buyer: true,
        seller: true,
      },
    });
    if (!transaction) return;
    if (transaction.status !== TransactionStatus.AWAITING_PAYMENT) return;

    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: { status: TransactionStatus.NON_PAYMENT },
    });

    await this.prisma.user.update({
      where: { id: transaction.buyerId },
      data: { strikeCount: { increment: 1 } },
    });

    const buyer = await this.prisma.user.findUnique({
      where: { id: transaction.buyerId },
    });
    if (!buyer) return;

    if (buyer.strikeCount >= 3) {
      await this.prisma.user.update({
        where: { id: buyer.id },
        data: { suspendedAt: new Date() },
      });
      this.events.log({
        type: 'user.suspended',
        userId: buyer.id,
        payload: { reason: 'strikes' },
      });
    }

    await this.prisma.bid.deleteMany({ where: { lotId: transaction.lotId } });

    await this.prisma.lot.update({
      where: { id: transaction.lotId },
      data: {
        status: LotStatus.ACTIVE,
        auctionStatus: AuctionStatus.LIVE,
        currentBid: 0,
        bidCount: 0,
        winnerId: null,
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await this.notifications.create(
      transaction.sellerId,
      'Non-payment: lot re-listed',
      `The winning bidder for ${transaction.lot.title} did not complete payment. The lot has been re-listed.`,
      'payment',
      { lotId: transaction.lotId, transactionId },
    );

    await this.notifications.create(
      transaction.buyerId,
      'Payment deadline missed',
      `You did not complete payment for ${transaction.lot.title}. Strike ${buyer.strikeCount}/3.`,
      'payment',
    );

    this.events.log({
      type: 'transaction.non_payment',
      entityId: transactionId,
      entityType: 'transaction',
      payload: {
        buyerId: transaction.buyerId,
        lotId: transaction.lotId,
        strikeCount: buyer.strikeCount,
      },
    });
  }

  async handleInspectionDeadline(transactionId: string): Promise<void> {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });
    if (!tx || tx.status !== TransactionStatus.INSPECTION_WINDOW) return;
    await this.releaseEscrowAndComplete(tx.id);
  }

  async confirmReceipt(transactionId: string, buyerId: string): Promise<void> {
    const tx = await this.prisma.transaction.findFirst({
      where: { id: transactionId, buyerId },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.status !== TransactionStatus.INSPECTION_WINDOW) {
      throw new BadRequestException('Invalid transaction state');
    }
    await this.releaseEscrowAndComplete(tx.id, true);
  }

  private async releaseEscrowAndComplete(
    transactionId: string,
    manualConfirm = false,
  ): Promise<void> {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { buyer: true, seller: true, lot: true },
    });
    if (!tx) return;

    const buyer = tx.buyer;
    const seller = tx.seller;
    if (!buyer.mangopayWalletId || !seller.mangopayWalletId) {
      await this.ensureWalletForUser(buyer.id);
      await this.ensureWalletForUser(seller.id);
    }
    const b = await this.prisma.user.findUnique({
      where: { id: buyer.id },
    });
    const s = await this.prisma.user.findUnique({
      where: { id: seller.id },
    });
    if (!b?.mangopayWalletId || !s?.mangopayWalletId) {
      throw new BadRequestException('Wallets not ready');
    }

    const transferAmount = tx.sellerPayout;
    const platformFee = Math.max(0, tx.hammerPrice - transferAmount);

    const transfer = await this.provider.transfer(
      b.mangopayWalletId,
      s.mangopayWalletId,
      transferAmount,
      platformFee,
    );

    let payoutId: string | null = null;
    if (s.mangopayBankAccountId) {
      const p = await this.provider.createPayout(
        s.mangopayUserId!,
        s.mangopayWalletId,
        s.mangopayBankAccountId,
        transferAmount,
      );
      payoutId = p.payoutId;
    }

    await this.prisma.$transaction(async (db) => {
      await db.transaction.update({
        where: { id: tx.id },
        data: {
          status: TransactionStatus.COMPLETED,
          buyerConfirmedAt: new Date(),
          mangopayTransferId: transfer.transferId,
          mangopayPayOutId: payoutId,
          payoutTriggeredAt: new Date(),
        },
      });

      await db.payout.upsert({
        where: { transactionId: tx.id },
        create: {
          transactionId: tx.id,
          sellerId: seller.id,
          amount: transferAmount,
          mangopayPayoutId: payoutId,
          status: PayoutStatus.PROCESSING,
        },
        update: {
          amount: transferAmount,
          mangopayPayoutId: payoutId,
          status: PayoutStatus.PROCESSING,
        },
      });
    });

    await this.notifications.notify({
      userId: seller.id,
      title: 'Payment released',
      body: 'Payment released — funds will arrive in 2-3 business days',
      type: 'payment.released',
      metadata: { transactionId: tx.id },
      sendEmail: true,
      emailTemplate: 'seller_payout',
      emailData: {
        lotTitle: tx.lot.title,
        amount: transferAmount,
      },
    });

    this.events.log({
      type: 'transaction.completed',
      entityId: tx.id,
      entityType: 'transaction',
      payload: { manualConfirm },
    });
  }

  async raiseDispute(
    transactionId: string,
    buyerId: string,
    dto: { reason: string; description: string; evidence?: string[] },
  ) {
    const row = await this.prisma.transaction.findFirst({
      where: { id: transactionId, buyerId },
      include: { lot: true },
    });
    if (!row) throw new NotFoundException('Transaction not found');
    if (row.status !== TransactionStatus.INSPECTION_WINDOW) {
      throw new BadRequestException(
        'Disputes can only be raised during inspection',
      );
    }

    const existing = await this.prisma.dispute.findUnique({
      where: { transactionId: row.id },
    });
    if (existing) throw new BadRequestException('Dispute already exists');

    await this.prisma.$transaction(async (db) => {
      await db.dispute.create({
        data: {
          transactionId: row.id,
          raisedById: buyerId,
          reason: dto.reason,
          description: dto.description,
          evidence: dto.evidence ? (dto.evidence as object) : undefined,
          status: DisputeStatus.OPEN,
        },
      });
      await db.transaction.update({
        where: { id: row.id },
        data: { status: TransactionStatus.DISPUTED },
      });
    });

    await this.notifications.create(
      row.sellerId,
      'Dispute opened',
      `A dispute has been raised on ${row.lot.title}`,
      'dispute.open',
      { transactionId },
    );

    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN, deletedAt: null },
    });
    for (const a of admins) {
      await this.notifications.create(
        a.id,
        'Dispute review',
        'New dispute requires review',
        'dispute.admin',
        { transactionId },
      );
    }

    this.events.log({
      type: 'dispute.created',
      userId: buyerId,
      entityId: transactionId,
      entityType: 'transaction',
      payload: { reason: dto.reason },
    });
  }

  async listMyTransactions(userId: string) {
    return this.prisma.transaction.findMany({
      where: { buyerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        lot: { select: { id: true, title: true, slug: true } },
      },
    });
  }

  async listSellerTransactions(sellerId: string) {
    return this.prisma.transaction.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      include: {
        lot: { select: { id: true, title: true, slug: true } },
        buyer: { select: { firstName: true, lastName: true, email: true } },
      },
    });
  }

  async listSellerPayouts(sellerId: string) {
    return this.prisma.payout.findMany({
      where: { sellerId },
      orderBy: { createdAt: 'desc' },
      include: {
        transaction: {
          include: { lot: { select: { title: true, slug: true } } },
        },
      },
    });
  }

  async listAllTransactions() {
    return this.prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        lot: true,
        buyer: { select: { email: true, firstName: true } },
        seller: { select: { email: true, firstName: true } },
      },
    });
  }

  async listAllDisputes() {
    return this.prisma.dispute.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        transaction: {
          include: {
            lot: { select: { title: true } },
            buyer: true,
            seller: true,
          },
        },
      },
    });
  }

  async listAllPayouts() {
    return this.prisma.payout.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        seller: { select: { email: true } },
        transaction: true,
      },
    });
  }

  /** Admin table: formatted rows + optional status filter. */
  async listAdminPayouts(status?: PayoutStatus) {
    const rows = await this.prisma.payout.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        seller: { select: { firstName: true, lastName: true, email: true } },
        transaction: { include: { lot: { select: { title: true } } } },
      },
    });
    return {
      items: rows.map((p) => ({
        id: p.id,
        transactionId: p.transactionId,
        sellerId: p.sellerId,
        sellerName:
          `${p.seller.firstName} ${p.seller.lastName}`.trim() || p.seller.email,
        amount: p.amount,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        completedAt: p.completedAt?.toISOString() ?? null,
        lotTitle: p.transaction.lot.title,
      })),
    };
  }

  async retryFailedPayout(adminId: string, payoutId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { transaction: { include: { lot: true } }, seller: true },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== PayoutStatus.FAILED) {
      throw new BadRequestException('Only failed payouts can be retried');
    }

    await this.ensureWalletForUser(payout.sellerId);
    const s = await this.prisma.user.findUnique({
      where: { id: payout.sellerId },
    });
    if (!s?.mangopayBankAccountId || !s?.mangopayWalletId) {
      throw new BadRequestException('Seller payout details not configured');
    }

    const created = await this.provider.createPayout(
      s.mangopayUserId!,
      s.mangopayWalletId,
      s.mangopayBankAccountId,
      payout.amount,
    );

    await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        mangopayPayoutId: created.payoutId,
        status: PayoutStatus.PROCESSING,
        completedAt: null,
      },
    });

    this.events.log({
      type: 'admin.payout_retry',
      userId: adminId,
      entityId: payoutId,
      entityType: 'payout',
      payload: { lotId: payout.transaction.lotId },
    });

    return { success: true };
  }

  async resolveDispute(
    disputeId: string,
    adminId: string,
    dto: {
      resolution: 'buyer' | 'seller' | 'partial';
      refundAmount?: number;
      note: string;
    },
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { transaction: { include: { buyer: true, seller: true } } },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');

    const tx = dispute.transaction;
    const refund =
      dto.resolution === 'partial' && dto.refundAmount != null
        ? dto.refundAmount
        : dto.resolution === 'buyer'
          ? tx.totalAmount
          : 0;

    await this.prisma.$transaction(async (db) => {
      await db.dispute.update({
        where: { id: disputeId },
        data: {
          status:
            dto.resolution === 'buyer'
              ? DisputeStatus.RESOLVED_BUYER
              : dto.resolution === 'seller'
                ? DisputeStatus.RESOLVED_SELLER
                : DisputeStatus.RESOLVED_PARTIAL,
          resolution: dto.note,
          refundAmount: refund > 0 ? refund : null,
          resolvedAt: new Date(),
        },
      });
      await db.transaction.update({
        where: { id: tx.id },
        data: { status: TransactionStatus.DISPUTE_RESOLVED },
      });
    });

    this.events.log({
      type: 'dispute.resolved',
      userId: adminId,
      entityId: disputeId,
      entityType: 'dispute',
      payload: { resolution: dto.resolution, refund },
    });

    return { success: true };
  }

  async startCardValidation(userId: string, returnUrl: string) {
    await this.ensureWalletForUser(userId);
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u?.mangopayUserId) throw new BadRequestException('Wallet missing');
    return this.provider.createCardValidation(u.mangopayUserId, returnUrl);
  }

  async submitKyc(
    userId: string,
    documentType: string,
    pages: Buffer[],
  ): Promise<{ documentId: string }> {
    await this.ensureWalletForUser(userId);
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u?.mangopayUserId) throw new BadRequestException('Wallet missing');
    await this.prisma.user.update({
      where: { id: userId },
      data: { kycStatus: KycStatus.PENDING },
    });
    return this.provider.submitKycDocument(
      u.mangopayUserId,
      documentType,
      pages,
    );
  }

  async getKycStatusForUser(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u?.mangopayUserId) {
      return { kycStatus: u?.kycStatus ?? KycStatus.NOT_STARTED };
    }
    const remote = await this.provider.getKycStatus(u.mangopayUserId);
    return { kycStatus: u.kycStatus, remoteStatus: remote.status };
  }

  async registerSellerBankAccount(
    sellerId: string,
    dto: {
      iban: string;
      bic: string;
      ownerName: string;
      ownerAddress: Record<string, unknown>;
    },
  ) {
    await this.ensureWalletForUser(sellerId);
    const u = await this.prisma.user.findUnique({ where: { id: sellerId } });
    if (!u?.mangopayUserId) throw new BadRequestException('Wallet missing');
    const { bankAccountId } = await this.provider.registerBankAccount(
      u.mangopayUserId,
      dto.iban,
      dto.bic,
      dto.ownerName,
      dto.ownerAddress,
    );
    await this.prisma.user.update({
      where: { id: sellerId },
      data: { mangopayBankAccountId: bankAccountId },
    });
    return { bankAccountId };
  }

  async recordWebhookEvent(eventId: string): Promise<boolean> {
    const key = `webhook:${eventId}`;
    const ok = await this.redis.setNxEx(key, '1', 86400);
    return ok;
  }

  async handleMangopayWebhookEvent(
    eventType: string,
    resourceId: string,
  ): Promise<void> {
    switch (eventType) {
      case 'PAYIN_NORMAL_SUCCEEDED':
        await this.processPayInSucceeded(resourceId);
        break;
      case 'KYC_SUCCEEDED':
        await this.prisma.user.updateMany({
          where: { mangopayUserId: resourceId },
          data: { kycStatus: KycStatus.VERIFIED },
        });
        break;
      case 'KYC_FAILED':
        await this.prisma.user.updateMany({
          where: { mangopayUserId: resourceId },
          data: { kycStatus: KycStatus.FAILED },
        });
        break;
      default:
        break;
    }
  }
}
