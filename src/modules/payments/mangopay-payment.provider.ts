import { Injectable, Logger } from '@nestjs/common';
import type {
  BankWireDetails,
  PaymentProvider,
  PaymentProviderUser,
} from './payment-provider.interface';
import { MangopayService } from './mangopay.service';

/** Real Mangopay — requires ENABLE_MANGOPAY and valid credentials. */
@Injectable()
export class MangopayPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(MangopayPaymentProvider.name);

  constructor(private readonly mangopay: MangopayService) {}

  async createUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    userType: string;
    countryCode: string;
    companyName?: string;
    vatNumber?: string;
  }): Promise<PaymentProviderUser> {
    return this.mangopay.createUserAndWallet(user);
  }

  async createCardValidation(
    externalUserId: string,
    returnUrl: string,
  ): Promise<{ redirectUrl: string; validationId: string }> {
    return this.mangopay.createCardValidation(externalUserId, returnUrl);
  }

  async submitKycDocument(
    externalUserId: string,
    documentType: string,
    pages: Buffer[],
  ): Promise<{ documentId: string }> {
    return this.mangopay.submitKycDocument(externalUserId, documentType, pages);
  }

  async getKycStatus(externalUserId: string): Promise<{ status: string }> {
    return this.mangopay.getKycStatus(externalUserId);
  }

  async createBankWirePayIn(
    externalUserId: string,
    walletId: string,
    amountCents: number,
    tag: string,
  ): Promise<BankWireDetails> {
    return this.mangopay.createBankWirePayIn(
      externalUserId,
      walletId,
      amountCents,
      tag,
    );
  }

  async transfer(
    fromWalletId: string,
    toWalletId: string,
    amountCents: number,
    feesCents: number,
  ): Promise<{ transferId: string }> {
    return this.mangopay.transfer(
      fromWalletId,
      toWalletId,
      amountCents,
      feesCents,
    );
  }

  async createPayout(
    externalUserId: string,
    walletId: string,
    bankAccountId: string,
    amountCents: number,
  ): Promise<{ payoutId: string }> {
    return this.mangopay.createPayout(
      externalUserId,
      walletId,
      bankAccountId,
      amountCents,
    );
  }

  async registerBankAccount(
    externalUserId: string,
    iban: string,
    bic: string,
    ownerName: string,
    ownerAddress: Record<string, unknown>,
  ): Promise<{ bankAccountId: string }> {
    return this.mangopay.registerBankAccount(
      externalUserId,
      iban,
      bic,
      ownerName,
      ownerAddress,
    );
  }
}
