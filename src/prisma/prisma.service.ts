import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  createExtendedPrismaClient,
  type ExtendedPrismaClient,
} from './soft-delete.extension';

type TransactionFn = ExtendedPrismaClient['$transaction'];

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly db: ExtendedPrismaClient;

  constructor() {
    this.db = createExtendedPrismaClient();
  }

  async onModuleInit() {
    await this.db.$connect();
  }

  async onModuleDestroy() {
    await this.db.$disconnect();
  }

  get $transaction(): TransactionFn {
    return this.db.$transaction.bind(this.db);
  }

  $queryRawUnsafe<T = unknown>(
    query: string,
    ...values: unknown[]
  ): Promise<T> {
    return this.db.$queryRawUnsafe(query, ...values) as Promise<T>;
  }

  get user() {
    return this.db.user;
  }
  get lot() {
    return this.db.lot;
  }
  get bid() {
    return this.db.bid;
  }
  get event() {
    return this.db.event;
  }
  get vertical() {
    return this.db.vertical;
  }
  get category() {
    return this.db.category;
  }
  get specTemplate() {
    return this.db.specTemplate;
  }
  get lotLocation() {
    return this.db.lotLocation;
  }
  get lotImage() {
    return this.db.lotImage;
  }
  get lotDocument() {
    return this.db.lotDocument;
  }
  get transaction() {
    return this.db.transaction;
  }
  get dispute() {
    return this.db.dispute;
  }
  get payout() {
    return this.db.payout;
  }
  get watchlistItem() {
    return this.db.watchlistItem;
  }
  get notification() {
    return this.db.notification;
  }
  get notificationPreferences() {
    return this.db.notificationPreferences;
  }
}
