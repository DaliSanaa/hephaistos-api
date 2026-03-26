import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuctionStatus, LotStatus, TransactionStatus } from '@prisma/client';
import type { Job, Queue } from 'bullmq';
import { calculateBreakdown } from '../../common/utils/pricing';
import { EventService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FeedService } from '../search/feed.service';
import { IndexNowService } from '../search/indexnow.service';
import { SitemapService } from '../search/sitemap.service';
import { TypesenseService } from '../search/typesense.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuctionsGateway } from './auctions.gateway';

const LOCK_TTL_SEC = 10;

@Processor('auctions')
export class AuctionProcessor extends WorkerHost {
  private readonly logger = new Logger(AuctionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: EventService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    private readonly typesense: TypesenseService,
    private readonly indexNow: IndexNowService,
    private readonly feed: FeedService,
    private readonly sitemap: SitemapService,
    private readonly gateway: AuctionsGateway,
    @InjectQueue('auctions') private readonly auctionQueue: Queue,
    @InjectQueue('payment') private readonly paymentQueue: Queue,
  ) {
    super();
  }

  async process(
    job: Job<{ lotId: string; transactionId?: string }>,
  ): Promise<void> {
    try {
      switch (job.name) {
        case 'auction:start':
          await this.handleStart(job as Job<{ lotId: string }>);
          break;
        case 'auction:end':
          await this.handleEnd(job as Job<{ lotId: string }>);
          break;
        default:
          this.logger.warn(`Unknown job name: ${job.name}`);
      }
    } catch (err) {
      this.logger.error(
        `Job ${job.name} ${job.id} failed: ${err instanceof Error ? err.message : err}`,
      );
      this.events.log({
        type: 'job.failed',
        entityId: job.id?.toString(),
        entityType: 'job',
        payload: {
          name: job.name,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }

  private async handleStart(job: Job<{ lotId: string }>) {
    const { lotId } = job.data;
    const lot = await this.prisma.lot.findFirst({
      where: { id: lotId, deletedAt: null },
    });
    if (!lot) return;

    await this.prisma.lot.update({
      where: { id: lotId },
      data: { auctionStatus: AuctionStatus.LIVE },
    });

    await this.redis.del(`lot:${lot.slug}`);

    this.gateway.broadcastAuctionStatus(lotId, {
      event: 'auction:started',
      lotId,
      slug: lot.slug,
      status: 'LIVE',
    });

    this.events.log({
      type: 'auction.started',
      entityId: lotId,
      entityType: 'lot',
      payload: { slug: lot.slug },
    });
  }

  private async handleEnd(job: Job<{ lotId: string }>) {
    const { lotId } = job.data;
    const lockKey = `auction:lock:${lotId}`;
    const locked = await this.redis.setNxEx(lockKey, '1', LOCK_TTL_SEC);
    if (!locked) {
      this.logger.warn(`Could not acquire lock for auction:end ${lotId}`);
      throw new Error('Lock not acquired — will retry');
    }

    try {
      const lot = await this.prisma.lot.findUnique({
        where: { id: lotId },
        include: { seller: true },
      });
      if (!lot || lot.deletedAt) return;

      const bidCount = lot.bidCount;
      const currentBid = lot.currentBid;
      const reservePrice = lot.reservePrice;
      const winnerId = lot.winnerId;

      let sold = false;

      if (bidCount === 0) {
        await this.prisma.lot.update({
          where: { id: lotId },
          data: {
            auctionStatus: AuctionStatus.ENDED,
            status: LotStatus.ENDED,
            reserveMet: false,
          },
        });
        await this.notifications.create(
          lot.sellerId,
          'Auction ended',
          `Your auction for ${lot.title} has ended without a sale.`,
          'auction.ended_no_sale',
          { lotId },
        );
      } else if (
        reservePrice != null &&
        reservePrice > 0 &&
        currentBid < reservePrice
      ) {
        await this.prisma.lot.update({
          where: { id: lotId },
          data: {
            auctionStatus: AuctionStatus.ENDED,
            status: LotStatus.ENDED,
            reserveMet: false,
          },
        });
        await this.notifications.create(
          lot.sellerId,
          'Reserve not met',
          `Your auction for ${lot.title} ended — reserve was not met.`,
          'auction.reserve_not_met',
          { lotId },
        );
      } else if (winnerId) {
        sold = true;
        const hammer = currentBid;
        const buyerBreakdown = calculateBreakdown(hammer, 'PRIVATE');
        const sellerFee = Math.round(hammer * 0.05);
        const sellerPayout = Math.max(0, hammer - sellerFee);
        const platformRevenue = Math.max(
          0,
          buyerBreakdown.totalAmount - sellerPayout,
        );

        const paymentDeadline = new Date(Date.now() + 48 * 3600 * 1000);
        const createdTx = await this.prisma.$transaction(async (tx) => {
          await tx.lot.update({
            where: { id: lotId },
            data: {
              auctionStatus: AuctionStatus.ENDED,
              status: LotStatus.SOLD,
              reserveMet: true,
            },
          });

          return tx.transaction.create({
            data: {
              lotId,
              buyerId: winnerId,
              sellerId: lot.sellerId,
              hammerPrice: hammer,
              buyerPremium: buyerBreakdown.buyerPremium,
              vatAmount: buyerBreakdown.vatAmount,
              totalAmount: buyerBreakdown.totalAmount,
              sellerPayout,
              platformRevenue,
              status: TransactionStatus.AWAITING_PAYMENT,
              paymentDeadline,
            },
          });
        });

        const delay = paymentDeadline.getTime() - Date.now();
        await this.paymentQueue.add(
          'payment:deadline',
          { transactionId: createdTx.id },
          {
            jobId: `payment-deadline-${createdTx.id}`,
            delay: Math.max(0, delay),
          },
        );

        const eur = (c: number) => (c / 100).toFixed(2);
        const base = (
          this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
        ).replace(/\/$/, '');
        const paymentUrl = `${base}/en/dashboard`;
        await this.notifications.notify({
          userId: winnerId,
          title: 'You won!',
          body: `Congratulations! You won ${lot.title}`,
          type: 'auction.won',
          metadata: {
            lotId,
            transactionId: createdTx.id,
            slug: lot.slug,
          },
          sendEmail: true,
          emailTemplate: 'won',
          emailData: {
            lotTitle: lot.title,
            finalPrice: hammer,
            paymentUrl,
          },
        });
        await this.notifications.notify({
          userId: lot.sellerId,
          title: 'Item sold',
          body: `Your ${lot.title} has been sold for €${eur(hammer)}`,
          type: 'auction.sold',
          metadata: { lotId },
          sendEmail: true,
          emailTemplate: 'seller_lot_sold',
          emailData: {
            lotTitle: lot.title,
            finalPrice: hammer,
          },
        });
      } else {
        await this.prisma.lot.update({
          where: { id: lotId },
          data: {
            auctionStatus: AuctionStatus.ENDED,
            status: LotStatus.ENDED,
          },
        });
      }

      await this.typesense.indexLotById(lotId);
      this.indexNow.submitLotUrls(lot.slug);
      void this.feed.invalidate();
      void this.sitemap.invalidateAll();

      await this.redis.del(`lot:${lot.slug}`);
      await this.redis.del(`bid:current:${lotId}`);

      const updated = await this.prisma.lot.findUnique({
        where: { id: lotId },
      });

      this.gateway.broadcastAuctionStatus(lotId, {
        event: 'auction:ended',
        lotId,
        slug: lot.slug,
        sold,
        winnerId: winnerId ?? undefined,
        finalPrice: currentBid,
        status: updated?.status,
      });

      this.events.log({
        type: 'auction.ended',
        entityId: lotId,
        entityType: 'lot',
        payload: {
          finalPrice: currentBid,
          winnerId,
          reserveMet: updated?.reserveMet ?? false,
          bidCount,
          sold,
        },
      });
    } finally {
      await this.redis.del(lockKey);
    }
  }
}
