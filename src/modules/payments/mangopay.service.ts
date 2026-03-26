import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  BankWireDetails,
  PaymentProviderUser,
} from './payment-provider.interface';

/** Mangopay SDK wrapper — active only when ENABLE_MANGOPAY=true. */
@Injectable()
export class MangopayService implements OnModuleInit {
  private readonly logger = new Logger(MangopayService.name);
  private api: {
    Users: {
      create: (data: unknown) => Promise<{ Id: string }>;
      createKycDocument?: (
        userId: string,
        data: unknown,
      ) => Promise<{ Id: string }>;
    };
    Wallets: { create: (data: unknown) => Promise<{ Id: string }> };
    PayIns: { create: (data: unknown) => Promise<unknown> };
    Transfers: { create: (data: unknown) => Promise<{ Id: string }> };
    PayOuts: { create: (data: unknown) => Promise<{ Id: string }> };
  } | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (!this.config.get<boolean>('ENABLE_MANGOPAY')) {
      this.logger.log('Mangopay SDK disabled (ENABLE_MANGOPAY=false)');
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mp = require('mangopay2-nodejs-sdk') as {
        default?: new (c: unknown) => unknown;
      } & (new (c: unknown) => unknown);
      const Ctor =
        (mp as { default?: new (c: unknown) => unknown }).default ?? mp;
      this.api = new Ctor({
        clientId: this.config.get<string>('MANGOPAY_CLIENT_ID'),
        clientApiKey: this.config.get<string>('MANGOPAY_API_KEY'),
        baseUrl: this.config.get<string>('MANGOPAY_BASE_URL'),
      }) as NonNullable<typeof this.api>;
      this.logger.log('Mangopay SDK initialized');
    } catch (e) {
      this.logger.warn(
        `Mangopay SDK init failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  private ensureApi() {
    if (!this.api) {
      throw new BadRequestException(
        'Mangopay is not enabled or failed to initialize',
      );
    }
    return this.api;
  }

  async createUserAndWallet(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    userType: string;
    countryCode: string;
    companyName?: string;
    vatNumber?: string;
  }): Promise<PaymentProviderUser> {
    const api = this.ensureApi();
    const isBusiness = user.userType === 'BUSINESS';
    const mpUser = isBusiness
      ? await api.Users.create({
          PersonType: 'LEGAL',
          LegalPersonType: 'BUSINESS',
          Name: user.companyName ?? user.lastName,
          Email: user.email,
          LegalRepresentativeFirstName: user.firstName,
          LegalRepresentativeLastName: user.lastName,
          LegalRepresentativeEmail: user.email,
          LegalRepresentativeNationality: user.countryCode,
          LegalRepresentativeCountryOfResidence: user.countryCode,
          CompanyNumber: user.vatNumber ?? 'N/A',
          Tag: user.id,
        } as never)
      : await api.Users.create({
          PersonType: 'NATURAL',
          FirstName: user.firstName,
          LastName: user.lastName,
          Email: user.email,
          Birthday: Math.floor(Date.now() / 1000) - 25 * 365 * 24 * 3600,
          Nationality: user.countryCode,
          CountryOfResidence: user.countryCode,
          Tag: user.id,
        } as never);

    const wallet = await api.Wallets.create({
      Owners: [mpUser.Id],
      Currency: 'EUR',
      Description: 'Main wallet',
    } as never);

    return { externalUserId: mpUser.Id, walletId: wallet.Id };
  }

  createCardValidation(
    _externalUserId: string,
    _returnUrl: string,
  ): Promise<{ redirectUrl: string; validationId: string }> {
    this.ensureApi();
    void _externalUserId;
    void _returnUrl;
    return Promise.reject(
      new BadRequestException(
        'Card validation via Mangopay requires card registration — use dashboard flow',
      ),
    );
  }

  submitKycDocument(
    externalUserId: string,
    documentType: string,
    pages: Buffer[],
  ): Promise<{ documentId: string }> {
    const api = this.ensureApi();
    void externalUserId;
    void documentType;
    void pages;
    if (!api.Users.createKycDocument) {
      return Promise.reject(
        new BadRequestException('KYC document API not available'),
      );
    }
    return Promise.reject(
      new BadRequestException(
        'Use Mangopay dashboard KYC or extend SDK bindings',
      ),
    );
  }

  getKycStatus(_externalUserId: string): Promise<{ status: string }> {
    this.ensureApi();
    void _externalUserId;
    return Promise.resolve({ status: 'PENDING' });
  }

  async createBankWirePayIn(
    mangopayUserId: string,
    walletId: string,
    amountCents: number,
    tag: string,
  ): Promise<BankWireDetails> {
    const api = this.ensureApi();
    const payIn = (await api.PayIns.create({
      PaymentType: 'BANK_WIRE',
      ExecutionType: 'DIRECT',
      AuthorId: mangopayUserId,
      CreditedWalletId: walletId,
      DeclaredDebitedFunds: { Currency: 'EUR', Amount: amountCents },
      DeclaredFees: { Currency: 'EUR', Amount: 0 },
      Tag: tag,
    } as never)) as {
      Id: string;
      BankName?: string;
      IBAN?: string;
      BIC?: string;
      WireReference?: string;
    };
    return {
      payInId: payIn.Id,
      bankName: payIn.BankName ?? '—',
      iban: payIn.IBAN ?? '—',
      bic: payIn.BIC ?? '—',
      wireReference: payIn.WireReference ?? tag,
    };
  }

  async transfer(
    _fromWalletId: string,
    _toWalletId: string,
    amountCents: number,
    feesCents: number,
  ): Promise<{ transferId: string }> {
    void _fromWalletId;
    void _toWalletId;
    const api = this.ensureApi();
    const t = await api.Transfers.create({
      DebitedFunds: { Currency: 'EUR', Amount: amountCents },
      Fees: { Currency: 'EUR', Amount: feesCents },
    } as never);
    return { transferId: t.Id };
  }

  async createPayout(
    mangopayUserId: string,
    walletId: string,
    bankAccountId: string,
    amountCents: number,
  ): Promise<{ payoutId: string }> {
    const api = this.ensureApi();
    const p = await api.PayOuts.create({
      AuthorId: mangopayUserId,
      DebitedFunds: { Currency: 'EUR', Amount: amountCents },
      Fees: { Currency: 'EUR', Amount: 0 },
      DebitedWalletId: walletId,
      BankAccountId: bankAccountId,
      BankWireRef: 'Hephaistos payout',
      PaymentType: 'BANK_WIRE',
    } as never);
    return { payoutId: p.Id };
  }

  registerBankAccount(
    _externalUserId: string,
    _iban: string,
    _bic: string,
    _ownerName: string,
    _ownerAddress: Record<string, unknown>,
  ): Promise<{ bankAccountId: string }> {
    this.ensureApi();
    void _externalUserId;
    void _iban;
    void _bic;
    void _ownerName;
    void _ownerAddress;
    return Promise.reject(
      new BadRequestException(
        'Bank account registration via API not yet wired — use Mangopay dashboard',
      ),
    );
  }
}
