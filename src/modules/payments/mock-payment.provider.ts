import { randomBytes } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

function rid(len = 12): string {
  return randomBytes(len).toString('base64url').slice(0, len);
}
import type {
  BankWireDetails,
  PaymentProvider,
  PaymentProviderUser,
} from './payment-provider.interface';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  constructor(
    @InjectQueue('payment') private readonly paymentQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  createUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    userType: string;
    countryCode: string;
    companyName?: string;
    vatNumber?: string;
  }): Promise<PaymentProviderUser> {
    void user;
    const externalUserId = `mock_user_${rid(12)}`;
    const walletId = `mock_wallet_${rid(12)}`;
    return Promise.resolve({ externalUserId, walletId });
  }

  async createCardValidation(
    externalUserId: string,
    returnUrl: string,
  ): Promise<{ redirectUrl: string; validationId: string }> {
    const validationId = `mock_cv_${rid(8)}`;
    await this.paymentQueue.add(
      'mock:card-validated',
      { externalUserId, validationId },
      { delay: 2000 },
    );
    return {
      redirectUrl: `${returnUrl}?status=success&id=${validationId}`,
      validationId,
    };
  }

  async submitKycDocument(
    externalUserId: string,
    documentType: string,
    pages: Buffer[],
  ): Promise<{ documentId: string }> {
    void documentType;
    void pages;
    const documentId = `mock_kyc_${rid(8)}`;
    await this.paymentQueue.add(
      'mock:kyc-verified',
      { externalUserId, documentId },
      { delay: 3000 },
    );
    return { documentId };
  }

  async getKycStatus(externalUserId: string): Promise<{ status: string }> {
    const user = await this.prisma.user.findFirst({
      where: { mangopayUserId: externalUserId },
    });
    return { status: user?.kycStatus ?? 'NOT_STARTED' };
  }

  async createBankWirePayIn(
    externalUserId: string,
    walletId: string,
    amountCents: number,
    tag: string,
  ): Promise<BankWireDetails> {
    void externalUserId;
    void walletId;
    void tag;
    const payInId = `mock_payin_${rid(8)}`;
    const wireReference = `HPH-${rid(6).toUpperCase()}`;
    await this.paymentQueue.add(
      'mock:payin-succeeded',
      { payInId, amountCents },
      { delay: 5000 },
    );
    return {
      payInId,
      bankName: 'Mock Bank (Simulated)',
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      wireReference,
    };
  }

  transfer(
    fromWalletId: string,
    toWalletId: string,
    amountCents: number,
    feesCents: number,
  ): Promise<{ transferId: string }> {
    void fromWalletId;
    void toWalletId;
    void amountCents;
    void feesCents;
    return Promise.resolve({ transferId: `mock_transfer_${rid(8)}` });
  }

  async createPayout(
    externalUserId: string,
    walletId: string,
    bankAccountId: string,
    amountCents: number,
  ): Promise<{ payoutId: string }> {
    void externalUserId;
    void walletId;
    void bankAccountId;
    void amountCents;
    const payoutId = `mock_payout_${rid(8)}`;
    await this.paymentQueue.add(
      'mock:payout-succeeded',
      { payoutId },
      { delay: 3000 },
    );
    return { payoutId };
  }

  registerBankAccount(
    externalUserId: string,
    iban: string,
    bic: string,
    ownerName: string,
    ownerAddress: Record<string, unknown>,
  ): Promise<{ bankAccountId: string }> {
    void externalUserId;
    void iban;
    void bic;
    void ownerName;
    void ownerAddress;
    return Promise.resolve({ bankAccountId: `mock_bank_${rid(8)}` });
  }
}
