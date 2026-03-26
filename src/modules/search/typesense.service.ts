import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuctionStatus, LotStatus } from '@prisma/client';
import Typesense, { Client } from 'typesense';
import { PrismaService } from '../../prisma/prisma.service';

const COLLECTION = 'lots';

const LOTS_COLLECTION = {
  name: COLLECTION,
  fields: [
    { name: 'id', type: 'string' as const },
    { name: 'slug', type: 'string' as const },
    { name: 'title', type: 'string' as const },
    { name: 'brand', type: 'string' as const, facet: true },
    { name: 'model', type: 'string' as const },
    { name: 'year', type: 'int32' as const, facet: true },
    { name: 'categorySlug', type: 'string' as const, facet: true },
    { name: 'verticalSlug', type: 'string' as const, facet: true },
    { name: 'condition', type: 'string' as const, facet: true },
    { name: 'description', type: 'string' as const },
    { name: 'countryCode', type: 'string' as const, facet: true },
    { name: 'city', type: 'string' as const },
    { name: 'currentBid', type: 'int64' as const },
    { name: 'startingPrice', type: 'int64' as const },
    { name: 'bidCount', type: 'int32' as const },
    { name: 'endDate', type: 'int64' as const },
    { name: 'auctionStatus', type: 'string' as const, facet: true },
    { name: 'imageUrl', type: 'string' as const },
    { name: 'specs', type: 'string' as const },
    { name: 'location', type: 'geopoint' as const },
    { name: 'createdAt', type: 'int64' as const },
  ],
  default_sorting_field: 'endDate',
};

/** Lot row with relations required for indexing. */
export interface LotIndexPayload {
  id: string;
  slug: string;
  title: string;
  brand: string;
  model: string;
  year: number;
  description: string;
  condition: string;
  specs: unknown;
  currentBid: number;
  startingPrice: number;
  bidCount: number;
  endDate: Date;
  createdAt: Date;
  auctionStatus: AuctionStatus;
  category: { slug: string; vertical: { slug: string } };
  location: {
    lat: number;
    lng: number;
    countryCode: string;
    city: string;
  } | null;
  images: { isPrimary: boolean; url: string }[];
}

@Injectable()
export class TypesenseService implements OnModuleInit {
  private readonly logger = new Logger(TypesenseService.name);
  private client: Client | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  get enabled(): boolean {
    return this.config.get<boolean>('ENABLE_TYPESENSE') === true;
  }

  getClient(): Client {
    if (!this.client) {
      throw new Error('Typesense client not initialized');
    }
    return this.client;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Typesense disabled (ENABLE_TYPESENSE=false)');
      return;
    }

    const host = this.config.get<string>('TYPESENSE_HOST') ?? '';
    const port = this.config.get<number>('TYPESENSE_PORT') ?? 8108;
    const apiKey = this.config.get<string>('TYPESENSE_API_KEY') ?? '';

    if (!host || host === 'localhost' || host === '127.0.0.1') {
      this.logger.warn(
        `Typesense enabled but host is "${host || '(empty)'}" — skipping connection`,
      );
      return;
    }

    const protocol = 'https';

    this.client = new Typesense.Client({
      nodes: [{ host, port, protocol }],
      apiKey,
      connectionTimeoutSeconds: 5,
    });

    try {
      await this.client.collections(COLLECTION).retrieve();
    } catch {
      try {
        this.logger.log('Creating Typesense collection "lots"');
        await this.client.collections().create(LOTS_COLLECTION);
        await this.syncAllLots();
      } catch (err) {
        this.logger.error('Failed to initialize Typesense — continuing without search', err);
        this.client = null;
      }
    }
  }

  mapLotToDocument(lot: LotIndexPayload): Record<string, unknown> {
    const primary =
      lot.images.find((i: { isPrimary: boolean; url: string }) => i.isPrimary)
        ?.url ||
      lot.images[0]?.url ||
      '';
    const specStr =
      typeof lot.specs === 'object' && lot.specs !== null
        ? JSON.stringify(lot.specs)
        : '{}';
    const lat = lot.location?.lat ?? 0;
    const lng = lot.location?.lng ?? 0;

    return {
      id: lot.id,
      slug: lot.slug,
      title: lot.title,
      brand: lot.brand,
      model: lot.model,
      year: lot.year,
      categorySlug: lot.category.slug,
      verticalSlug: lot.category.vertical.slug,
      condition: lot.condition,
      description: lot.description,
      countryCode: lot.location?.countryCode || '',
      city: lot.location?.city || '',
      currentBid: lot.currentBid,
      startingPrice: lot.startingPrice,
      bidCount: lot.bidCount,
      endDate: Math.floor(lot.endDate.getTime() / 1000),
      auctionStatus: lot.auctionStatus,
      imageUrl: primary,
      specs: specStr,
      location: [lat, lng],
      createdAt: Math.floor(lot.createdAt.getTime() / 1000),
    };
  }

  async indexLot(lot: LotIndexPayload): Promise<void> {
    if (!this.enabled || !this.client) return;
    const doc = this.mapLotToDocument(lot);
    await this.client.collections(COLLECTION).documents().upsert(doc);
  }

  async indexLotById(lotId: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    const lot = await this.prisma.lot.findFirst({
      where: { id: lotId, deletedAt: null },
      include: {
        category: { include: { vertical: true } },
        location: true,
        images: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!lot || lot.status !== LotStatus.ACTIVE) {
      await this.removeLot(lotId);
      return;
    }
    await this.indexLot(lot as LotIndexPayload);
  }

  async removeLot(lotId: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    try {
      await this.client.collections(COLLECTION).documents(lotId).delete();
    } catch {
      /* ignore */
    }
  }

  async updateBidFields(
    lotId: string,
    payload: { currentBid: number; bidCount: number },
  ): Promise<void> {
    if (!this.enabled || !this.client) return;
    try {
      await this.client
        .collections(COLLECTION)
        .documents(lotId)
        .update(payload);
    } catch {
      /* ignore */
    }
  }

  async updateEndDate(lotId: string, endDate: Date): Promise<void> {
    if (!this.enabled || !this.client) return;
    try {
      await this.client
        .collections(COLLECTION)
        .documents(lotId)
        .update({
          endDate: Math.floor(endDate.getTime() / 1000),
        });
    } catch {
      /* ignore */
    }
  }

  async updateAuctionStatus(
    lotId: string,
    auctionStatus: AuctionStatus,
  ): Promise<void> {
    if (!this.enabled || !this.client) return;
    try {
      await this.client
        .collections(COLLECTION)
        .documents(lotId)
        .update({ auctionStatus });
    } catch {
      /* ignore */
    }
  }

  async syncAllLots(): Promise<void> {
    if (!this.enabled || !this.client) return;
    const batchSize = 500;
    let cursor: string | undefined;

    while (true) {
      const lots = await this.prisma.lot.findMany({
        where: { status: LotStatus.ACTIVE, deletedAt: null },
        include: {
          category: { include: { vertical: true } },
          location: true,
          images: { orderBy: { sortOrder: 'asc' } },
        },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
      });

      if (lots.length === 0) break;

      const docs = lots.map((l) => this.mapLotToDocument(l as LotIndexPayload));
      await this.client
        .collections(COLLECTION)
        .documents()
        .import(docs, { action: 'upsert' });

      cursor = lots[lots.length - 1].id;
    }
    this.logger.log('Typesense full sync completed');
  }
}
