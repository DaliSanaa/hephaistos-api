export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

export interface PaymentProviderUser {
  externalUserId: string;
  walletId: string;
}

export interface BankWireDetails {
  payInId: string;
  bankName: string;
  iban: string;
  bic: string;
  wireReference: string;
}

export interface PaymentProvider {
  createUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    userType: string;
    countryCode: string;
    companyName?: string;
    vatNumber?: string;
  }): Promise<PaymentProviderUser>;

  createCardValidation(
    externalUserId: string,
    returnUrl: string,
  ): Promise<{ redirectUrl: string; validationId: string }>;

  submitKycDocument(
    externalUserId: string,
    documentType: string,
    pages: Buffer[],
  ): Promise<{ documentId: string }>;

  getKycStatus(externalUserId: string): Promise<{ status: string }>;

  createBankWirePayIn(
    externalUserId: string,
    walletId: string,
    amountCents: number,
    tag: string,
  ): Promise<BankWireDetails>;

  transfer(
    fromWalletId: string,
    toWalletId: string,
    amountCents: number,
    feesCents: number,
  ): Promise<{ transferId: string }>;

  createPayout(
    externalUserId: string,
    walletId: string,
    bankAccountId: string,
    amountCents: number,
  ): Promise<{ payoutId: string }>;

  registerBankAccount(
    externalUserId: string,
    iban: string,
    bic: string,
    ownerName: string,
    ownerAddress: Record<string, unknown>,
  ): Promise<{ bankAccountId: string }>;
}
