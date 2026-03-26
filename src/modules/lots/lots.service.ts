import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuctionStatus,
  AuctionType,
  LotStatus,
  Prisma,
  UserRole,
  UserType,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import { decodeCursor, encodeCursor } from '../../common/utils/cursor';
import { calculateBreakdown } from '../../common/utils/pricing';
import { generateListingRef, generateLotSlug } from '../../common/utils/slug';
import { EventService } from '../events/events.service';
import { FeedService } from '../search/feed.service';
import { IndexNowService } from '../search/indexnow.service';
import { SitemapService } from '../search/sitemap.service';
import { TypesenseService } from '../search/typesense.service';
import { VerticalsService } from '../verticals/verticals.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AdminLotsQueryDto } from './dto/admin-lots-query.dto';
import type { BrowseLotsDto } from './dto/browse-lots.dto';
import type { CreateLotDto } from './dto/create-lot.dto';
import type { SellerLotsQueryDto } from './dto/seller-lots-query.dto';
import type { UpdateLotDto } from './dto/update-lot.dto';

const LOT_CACHE_PREFIX = 'lot:';

function lastInitial(lastName: string): string {
  const t = lastName.trim();
  return t.length ? `${t[0].toUpperCase()}.` : '';
}

@Injectable()
export class LotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: EventService,
    private readonly notifications: NotificationsService,
    private readonly verticals: VerticalsService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => TypesenseService))
    private readonly typesense: TypesenseService,
    private readonly indexNow: IndexNowService,
    private readonly feed: FeedService,
    private readonly sitemap: SitemapService,
    @InjectQueue('auctions') private readonly auctionQueue: Queue,
  ) {}

  async invalidateLotCache(slug: string): Promise<void> {
    await this.redis.del(`${LOT_CACHE_PREFIX}${slug}`);
  }

  private buildBrowseWhere(params: BrowseLotsDto): Prisma.LotWhereInput {
    const and: Prisma.LotWhereInput[] = [
      { deletedAt: null },
      { status: LotStatus.ACTIVE },
    ];

    if (params.vertical || params.category) {
      and.push({
        category: {
          ...(params.category && {
            slug: {
              in: params.category.split(',').map((s) => s.trim()),
            },
          }),
          ...(params.vertical && {
            vertical: { slug: params.vertical },
          }),
        },
      });
    }

    if (params.status) {
      const map = {
        live: 'LIVE',
        upcoming: 'UPCOMING',
        ended: 'ENDED',
      } as const;
      and.push({
        auctionStatus: map[params.status as keyof typeof map],
      });
    }

    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      const currentBid: Prisma.IntFilter = {};
      if (params.minPrice !== undefined) currentBid.gte = params.minPrice;
      if (params.maxPrice !== undefined) currentBid.lte = params.maxPrice;
      and.push({ currentBid });
    }

    if (params.brand) {
      const brands = params.brand
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean);
      if (brands.length)
        and.push({
          OR: brands.map((b) => ({
            brand: { equals: b, mode: 'insensitive' as const },
          })),
        });
    }

    if (params.country) {
      const codes = params.country
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
      if (codes.length)
        and.push({
          location: { is: { countryCode: { in: codes } } },
        });
    }

    if (params.yearMin !== undefined || params.yearMax !== undefined) {
      const year: Prisma.IntFilter = {};
      if (params.yearMin !== undefined) year.gte = params.yearMin;
      if (params.yearMax !== undefined) year.lte = params.yearMax;
      and.push({ year });
    }

    if (params.search?.trim()) {
      const q = params.search.trim();
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
          { model: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    if (params.sort === 'ending_soon') {
      and.push({ auctionStatus: AuctionStatus.LIVE });
    }

    return { AND: and };
  }

  private getBrowseOrderBy(
    sort?: string,
  ): Prisma.LotOrderByWithRelationInput[] {
    const tie = { id: 'asc' as const };
    switch (sort) {
      case 'newly_listed':
        return [{ createdAt: 'desc' }, tie];
      case 'price_asc':
        return [{ currentBid: 'asc' }, tie];
      case 'price_desc':
        return [{ currentBid: 'desc' }, tie];
      case 'bid_count':
        return [{ bidCount: 'desc' }, tie];
      case 'ending_soon':
        return [{ endDate: 'asc' }, tie];
      default:
        return [{ endDate: 'asc' }, tie];
    }
  }

  async browseLots(params: BrowseLotsDto) {
    const limit = params.limit ?? 20;
    const where = this.buildBrowseWhere(params);
    const orderBy = this.getBrowseOrderBy(params.sort);
    const cursorId = params.cursor ? decodeCursor(params.cursor).id : undefined;

    const [items, total] = await Promise.all([
      this.prisma.lot.findMany({
        where,
        orderBy,
        take: limit + 1,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: {
          id: true,
          slug: true,
          title: true,
          brand: true,
          model: true,
          year: true,
          condition: true,
          specs: true,
          startingPrice: true,
          currentBid: true,
          bidCount: true,
          endDate: true,
          auctionStatus: true,
          reserveMet: true,
          images: {
            where: { isPrimary: true },
            take: 1,
            select: { url: true },
          },
          location: {
            select: { city: true, country: true, countryCode: true },
          },
          category: { select: { slug: true, labelKey: true } },
        },
      }),
      this.prisma.lot.count({ where }),
    ]);

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? encodeCursor(page[page.length - 1].id, '')
      : null;

    return {
      items: page.map(({ images, ...row }) => ({
        ...row,
        primaryImage: images[0]?.url ?? null,
      })),
      nextCursor,
      totalCount: total,
    };
  }

  private async loadLotDetailFromDb(slug: string) {
    const lot = await this.prisma.lot.findFirst({
      where: { slug, deletedAt: null },
      include: {
        category: {
          include: {
            specTemplates: { orderBy: { sortOrder: 'asc' } },
          },
        },
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
            countryCode: true,
          },
        },
        location: true,
        images: { orderBy: { sortOrder: 'asc' } },
        documents: true,
        bids: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            user: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
    });
    if (!lot) return null;
    return lot;
  }

  async getLotBySlug(
    slug: string,
    opts: { viewerUserId?: string | null; viewerUserType?: UserType | null },
  ) {
    const cacheKey = `${LOT_CACHE_PREFIX}${slug}`;
    const cached = await this.redis.get(cacheKey);
    let base: Awaited<ReturnType<typeof this.buildLotDetailPayload>>;

    if (cached) {
      base = JSON.parse(cached) as Awaited<
        ReturnType<typeof this.buildLotDetailPayload>
      >;
    } else {
      const row = await this.loadLotDetailFromDb(slug);
      if (!row) throw new NotFoundException('Lot not found');
      base = this.buildLotDetailPayload(row);
      await this.redis.set(cacheKey, JSON.stringify(base), 'EX', 30);
    }

    const snap = await this.redis.get(`bid:current:${base.id}`);
    let merged: typeof base = base;
    if (snap) {
      const o = JSON.parse(snap) as {
        amount: number;
        bidCount: number;
        endDate: string;
      };
      merged = {
        ...base,
        currentBid: o.amount,
        bidCount: o.bidCount,
        endDate: o.endDate,
      };
    }

    const hammer =
      merged.currentBid > 0 ? merged.currentBid : merged.startingPrice;
    const priceBreakdown = opts.viewerUserType
      ? calculateBreakdown(
          hammer,
          opts.viewerUserType === UserType.BUSINESS ? 'BUSINESS' : 'PRIVATE',
        )
      : undefined;

    this.events.log({
      type: 'lot.viewed',
      userId: opts.viewerUserId ?? undefined,
      entityId: base.id,
      entityType: 'lot',
      payload: { slug },
    });

    return { ...merged, priceBreakdown };
  }

  private buildLotDetailPayload(
    lot: NonNullable<Awaited<ReturnType<typeof this.loadLotDetailFromDb>>>,
  ) {
    return {
      id: lot.id,
      slug: lot.slug,
      listingRef: lot.listingRef,
      title: lot.title,
      brand: lot.brand,
      model: lot.model,
      year: lot.year,
      condition: lot.condition,
      description: lot.description,
      specs: lot.specs as Record<string, unknown>,
      startingPrice: lot.startingPrice,
      currentBid: lot.currentBid,
      bidCount: lot.bidCount,
      reserveMet: lot.reserveMet,
      reservePrice: lot.reservePrice,
      buyNowPrice: lot.buyNowPrice,
      endDate: lot.endDate.toISOString(),
      startDate: lot.startDate.toISOString(),
      auctionType: lot.auctionType,
      auctionStatus: lot.auctionStatus,
      status: lot.status,
      category: {
        id: lot.category.id,
        slug: lot.category.slug,
        labelKey: lot.category.labelKey,
        specTemplates: lot.category.specTemplates.map((t) => ({
          key: t.key,
          labelKey: t.labelKey,
          type: t.type,
          unit: t.unit,
          unitKey: t.unitKey,
          options: t.options,
          optionKeys: t.optionKeys,
          required: t.required,
          showInCard: t.showInCard,
          showInGrid: t.showInGrid,
        })),
      },
      seller: {
        id: lot.seller.id,
        firstName: lot.seller.firstName,
        lastName: lot.seller.lastName,
        companyName: lot.seller.companyName,
        countryCode: lot.seller.countryCode,
      },
      location: lot.location
        ? {
            city: lot.location.city,
            region: lot.location.region,
            country: lot.location.country,
            countryCode: lot.location.countryCode,
            lat: lot.location.lat,
            lng: lot.location.lng,
          }
        : null,
      images: lot.images.map((im) => ({
        url: im.url,
        sortOrder: im.sortOrder,
        isPrimary: im.isPrimary,
      })),
      documents: lot.documents.map((d) => ({
        name: d.name,
        type: d.type,
        url: d.url,
        size: d.size,
      })),
      bids: lot.bids.map((b) => ({
        amount: b.amount,
        createdAt: b.createdAt.toISOString(),
        user: {
          firstName: b.user.firstName,
          lastName: lastInitial(b.user.lastName),
        },
      })),
    };
  }

  async validateSpecs(
    categoryId: string,
    specs: Record<string, string | number>,
  ) {
    const required = await this.prisma.specTemplate.findMany({
      where: { categoryId, required: true },
    });
    for (const t of required) {
      const v = specs[t.key];
      if (v === undefined || v === null || v === '') {
        throw new BadRequestException(`Missing required spec field: ${t.key}`);
      }
    }
  }

  private validateDates(start: Date, end: Date) {
    const now = Date.now();
    const minStart = now + 3600_000;
    if (start.getTime() < minStart) {
      throw new BadRequestException(
        'startDate must be at least 1 hour in the future',
      );
    }
    const dur = end.getTime() - start.getTime();
    const minDur = 24 * 3600_000;
    const maxDur = 14 * 24 * 3600_000;
    if (dur < minDur || dur > maxDur) {
      throw new BadRequestException(
        'Auction duration must be between 24 hours and 14 days',
      );
    }
  }

  private validatePricing(dto: CreateLotDto | UpdateLotDto) {
    if (dto.reservePrice != null && dto.reservePrice < dto.startingPrice!) {
      throw new BadRequestException('reservePrice must be >= startingPrice');
    }
    if (dto.buyNowPrice != null && dto.buyNowPrice <= dto.startingPrice!) {
      throw new BadRequestException('buyNowPrice must be > startingPrice');
    }
  }

  async createLot(userId: string, dto: CreateLotDto) {
    const category = await this.prisma.category.findFirst({
      where: { slug: dto.categoryId, isActive: true },
    });
    if (!category) {
      throw new BadRequestException('Invalid category slug');
    }

    await this.validateSpecs(category.id, dto.specs);
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    this.validateDates(start, end);
    this.validatePricing(dto);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === UserRole.BUYER) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { role: UserRole.SELLER },
      });
      this.events.log({
        type: 'user.role_upgraded',
        userId,
        payload: { from: 'BUYER', to: 'SELLER' },
      });
    }

    let slug = generateLotSlug(dto.brand, dto.model, dto.year);
    for (let i = 0; i < 8; i++) {
      const exists = await this.prisma.lot.findUnique({ where: { slug } });
      if (!exists) break;
      slug = generateLotSlug(dto.brand, dto.model, dto.year);
    }

    const listingRef = generateListingRef();
    const condition =
      dto.condition.charAt(0).toUpperCase() + dto.condition.slice(1);

    const lot = await this.prisma.lot.create({
      data: {
        slug,
        listingRef,
        title: dto.title,
        brand: dto.brand,
        model: dto.model,
        year: dto.year,
        categoryId: category.id,
        condition,
        description: dto.description,
        specs: dto.specs as Prisma.InputJsonValue,
        sellerId: userId,
        auctionType: dto.auctionType as AuctionType,
        startingPrice: dto.startingPrice,
        reservePrice: dto.reservePrice,
        buyNowPrice: dto.buyNowPrice,
        startDate: start,
        endDate: end,
        status: LotStatus.PENDING_REVIEW,
        auctionStatus: AuctionStatus.UPCOMING,
      },
    });

    await this.prisma.lotLocation.create({
      data: {
        lotId: lot.id,
        city: dto.location.city,
        region: dto.location.region,
        country: dto.location.country,
        countryCode: dto.location.countryCode.toUpperCase(),
        lat: dto.location.lat,
        lng: dto.location.lng,
      },
    });

    const urls = dto.imageIds ?? [];
    for (let i = 0; i < urls.length; i++) {
      await this.prisma.lotImage.create({
        data: {
          lotId: lot.id,
          url: urls[i],
          sortOrder: i,
          isPrimary: i === 0,
        },
      });
    }

    const docUrls = dto.documentIds ?? [];
    for (let i = 0; i < docUrls.length; i++) {
      await this.prisma.lotDocument.create({
        data: {
          lotId: lot.id,
          name: `Document ${i + 1}`,
          type: 'file',
          url: docUrls[i],
          size: '—',
        },
      });
    }

    this.events.log({
      type: 'lot.created',
      userId,
      entityId: lot.id,
      entityType: 'lot',
      payload: {
        title: lot.title,
        category: category.slug,
        startingPrice: lot.startingPrice,
      },
    });

    await this.invalidateLotCache(slug);
    await this.verticals.invalidateCatalogCache();

    const viewer = await this.prisma.user.findUnique({ where: { id: userId } });
    return this.getLotBySlug(slug, {
      viewerUserId: userId,
      viewerUserType: viewer?.userType ?? null,
    });
  }

  async updateLot(userId: string, lotId: string, dto: UpdateLotDto) {
    const existing = await this.prisma.lot.findFirst({
      where: { id: lotId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Lot not found');
    if (existing.sellerId !== userId) {
      throw new ForbiddenException('Not the listing owner');
    }
    const editable = new Set<LotStatus>([
      LotStatus.DRAFT,
      LotStatus.PENDING_REVIEW,
      LotStatus.REJECTED,
    ]);
    if (!editable.has(existing.status)) {
      throw new BadRequestException(
        'Listing cannot be edited in current status',
      );
    }

    const existingCat = await this.prisma.category.findUnique({
      where: { id: existing.categoryId },
    });
    const categorySlug = dto.categoryId ?? existingCat?.slug;
    if (!categorySlug) throw new BadRequestException('Category missing');

    const category = await this.prisma.category.findFirst({
      where: { slug: categorySlug, isActive: true },
    });
    if (!category) throw new BadRequestException('Invalid category');

    const specs = (dto.specs ?? (existing.specs as object)) as Record<
      string,
      string | number
    >;
    await this.validateSpecs(category.id, specs);

    const start = dto.startDate ? new Date(dto.startDate) : existing.startDate;
    const end = dto.endDate ? new Date(dto.endDate) : existing.endDate;
    this.validateDates(start, end);

    const existingLoc = await this.prisma.lotLocation.findUnique({
      where: { lotId },
    });
    const location =
      dto.location ??
      (existingLoc
        ? {
            city: existingLoc.city,
            region: existingLoc.region,
            country: existingLoc.country,
            countryCode: existingLoc.countryCode,
            lat: existingLoc.lat,
            lng: existingLoc.lng,
          }
        : null);
    if (!location) {
      throw new BadRequestException('location is required');
    }

    const normalizedCond = dto.condition ?? existing.condition.toLowerCase();

    const merged: CreateLotDto = {
      title: dto.title ?? existing.title,
      brand: dto.brand ?? existing.brand,
      model: dto.model ?? existing.model,
      year: dto.year ?? existing.year,
      categoryId: category.slug,
      condition: normalizedCond,
      description: dto.description ?? existing.description,
      specs,
      auctionType: (dto.auctionType ??
        existing.auctionType) as CreateLotDto['auctionType'],
      startingPrice: dto.startingPrice ?? existing.startingPrice,
      reservePrice: dto.reservePrice ?? existing.reservePrice ?? undefined,
      buyNowPrice: dto.buyNowPrice ?? existing.buyNowPrice ?? undefined,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      location,
    };

    this.validatePricing({
      ...merged,
      startingPrice: merged.startingPrice,
    } as CreateLotDto);

    const condition =
      merged.condition.charAt(0).toUpperCase() + merged.condition.slice(1);

    const updated = await this.prisma.lot.update({
      where: { id: lotId },
      data: {
        title: merged.title,
        brand: merged.brand,
        model: merged.model,
        year: merged.year,
        categoryId: category.id,
        condition,
        description: merged.description,
        specs: merged.specs as Prisma.InputJsonValue,
        auctionType: merged.auctionType as AuctionType,
        startingPrice: merged.startingPrice,
        reservePrice: merged.reservePrice,
        buyNowPrice: merged.buyNowPrice,
        startDate: start,
        endDate: end,
        status:
          existing.status === LotStatus.REJECTED
            ? LotStatus.PENDING_REVIEW
            : existing.status,
        rejectionReason: null,
      },
    });

    if (dto.location) {
      await this.prisma.lotLocation.upsert({
        where: { lotId },
        create: {
          lotId,
          city: dto.location.city,
          region: dto.location.region,
          country: dto.location.country,
          countryCode: dto.location.countryCode.toUpperCase(),
          lat: dto.location.lat,
          lng: dto.location.lng,
        },
        update: {
          city: dto.location.city,
          region: dto.location.region,
          country: dto.location.country,
          countryCode: dto.location.countryCode.toUpperCase(),
          lat: dto.location.lat,
          lng: dto.location.lng,
        },
      });
    }

    const changedFields = Object.keys(dto).filter(
      (k) => (dto as Record<string, unknown>)[k] !== undefined,
    );
    this.events.log({
      type: 'lot.updated',
      userId,
      entityId: lotId,
      entityType: 'lot',
      payload: { changedFields },
    });

    await this.invalidateLotCache(updated.slug);
    await this.verticals.invalidateCatalogCache();

    if (updated.status === LotStatus.ACTIVE) {
      void this.typesense.indexLotById(lotId);
      this.indexNow.submitLotUrls(updated.slug);
      void this.feed.invalidate();
      void this.sitemap.invalidateAll();
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return this.getLotBySlug(updated.slug, {
      viewerUserId: userId,
      viewerUserType: user?.userType ?? null,
    });
  }

  async listSellerLots(userId: string, query: SellerLotsQueryDto) {
    const limit = query.limit ?? 20;
    const where: Prisma.LotWhereInput = {
      sellerId: userId,
      deletedAt: null,
      ...(query.status && { status: query.status }),
    };
    const cursorId = query.cursor ? decodeCursor(query.cursor).id : undefined;

    const items = await this.prisma.lot.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: {
        category: { select: { slug: true, labelKey: true } },
        location: { select: { city: true, countryCode: true } },
        images: { where: { isPrimary: true }, take: 1 },
        _count: { select: { watchedBy: true } },
      },
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? encodeCursor(page[page.length - 1].id, '')
      : null;

    return {
      items: page.map((l) => ({
        id: l.id,
        slug: l.slug,
        listingRef: l.listingRef,
        title: l.title,
        status: l.status,
        auctionStatus: l.auctionStatus,
        currentBid: l.currentBid,
        bidCount: l.bidCount,
        watchCount: l._count.watchedBy,
        endDate: l.endDate.toISOString(),
        category: l.category,
        location: l.location,
        primaryImage: l.images[0]?.url ?? null,
      })),
      nextCursor,
    };
  }

  async getSellerLotDetail(userId: string, lotId: string) {
    const lot = await this.prisma.lot.findFirst({
      where: { id: lotId, sellerId: userId, deletedAt: null },
      include: {
        category: { include: { specTemplates: true } },
        location: true,
        images: { orderBy: { sortOrder: 'asc' } },
        documents: true,
        bids: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        transaction: true,
      },
    });
    if (!lot) throw new NotFoundException('Lot not found');

    const viewCount = await this.prisma.event.count({
      where: { type: 'lot.viewed', entityId: lotId, entityType: 'lot' },
    });
    const watchCount = await this.prisma.watchlistItem.count({
      where: { lotId },
    });

    return {
      id: lot.id,
      slug: lot.slug,
      listingRef: lot.listingRef,
      title: lot.title,
      status: lot.status,
      auctionStatus: lot.auctionStatus,
      rejectionReason: lot.rejectionReason,
      specs: lot.specs,
      bids: lot.bids.map((b) => ({
        id: b.id,
        amount: b.amount,
        createdAt: b.createdAt.toISOString(),
        user: b.user,
      })),
      viewCount,
      watchCount,
      transaction: lot.transaction
        ? {
            status: lot.transaction.status,
            totalAmount: lot.transaction.totalAmount,
            hammerPrice: lot.transaction.hammerPrice,
          }
        : null,
      images: lot.images,
      documents: lot.documents,
      location: lot.location,
      category: lot.category,
    };
  }

  async listAdminLots(query: AdminLotsQueryDto) {
    const limit = query.limit ?? 20;
    const where: Prisma.LotWhereInput = {
      deletedAt: null,
      ...(query.status && { status: query.status }),
      ...(query.category && {
        category: { slug: query.category },
      }),
      ...(query.seller && { sellerId: query.seller }),
      ...(query.fromDate || query.toDate
        ? {
            createdAt: {
              ...(query.fromDate && { gte: new Date(query.fromDate) }),
              ...(query.toDate && { lte: new Date(query.toDate) }),
            },
          }
        : {}),
    };

    const cursorId = query.cursor ? decodeCursor(query.cursor).id : undefined;

    const items = await this.prisma.lot.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      include: {
        seller: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            companyName: true,
          },
        },
        category: true,
        location: true,
        images: { take: 3 },
      },
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? encodeCursor(page[page.length - 1].id, '')
      : null;

    return {
      items: page.map((l) => ({
        ...l,
        seller: l.seller,
      })),
      nextCursor,
      totalCount: await this.prisma.lot.count({ where }),
    };
  }

  async reviewQueue() {
    return this.prisma.lot.findMany({
      where: { status: LotStatus.PENDING_REVIEW, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        seller: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            companyName: true,
          },
        },
        category: true,
        location: true,
        images: { take: 1 },
      },
    });
  }

  async approveLot(adminId: string, lotId: string) {
    const lot = await this.prisma.lot.findFirst({
      where: { id: lotId, deletedAt: null },
      include: { seller: true },
    });
    if (!lot) throw new NotFoundException('Lot not found');

    const seller = lot.seller;
    if (seller.userType === UserType.BUSINESS && !seller.vatNumber?.trim()) {
      throw new BadRequestException(
        'Business seller must have a VAT number before approval',
      );
    }

    const now = new Date();
    const auctionStatus =
      lot.startDate <= now ? AuctionStatus.LIVE : AuctionStatus.UPCOMING;

    for (const jid of [`auction-start-${lotId}`, `auction-end-${lotId}`]) {
      const j = await this.auctionQueue.getJob(jid);
      await j?.remove();
    }

    await this.prisma.lot.update({
      where: { id: lotId },
      data: {
        status: LotStatus.ACTIVE,
        auctionStatus,
      },
    });

    const startMs = lot.startDate.getTime() - Date.now();
    const endMs = lot.endDate.getTime() - Date.now();

    if (startMs > 0) {
      await this.auctionQueue.add(
        'auction:start',
        { lotId },
        {
          jobId: `auction-start-${lotId}`,
          delay: startMs,
        },
      );
    }
    await this.auctionQueue.add(
      'auction:end',
      { lotId },
      {
        jobId: `auction-end-${lotId}`,
        delay: Math.max(0, endMs),
      },
    );

    await this.invalidateLotCache(lot.slug);
    await this.verticals.invalidateCatalogCache();

    void this.typesense.indexLotById(lotId);
    this.indexNow.submitLotUrls(lot.slug);
    void this.feed.invalidate();
    void this.sitemap.invalidateAll();

    this.events.log({
      type: 'lot.approved',
      userId: adminId,
      entityId: lotId,
      entityType: 'lot',
      payload: {},
    });

    const base = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    await this.notifications.notify({
      userId: seller.id,
      title: 'Listing approved',
      body: 'Your listing has been approved and is now live.',
      type: 'lot.approved',
      metadata: { lotId },
      sendEmail: true,
      emailTemplate: 'lot_approved',
      emailData: {
        lotTitle: lot.title,
        lotUrl: `${base}/en/lot/${lot.slug}`,
      },
    });

    return this.prisma.lot.findUnique({ where: { id: lotId } });
  }

  async rejectLot(adminId: string, lotId: string, reason: string) {
    const lot = await this.prisma.lot.findFirst({
      where: { id: lotId, deletedAt: null },
    });
    if (!lot) throw new NotFoundException('Lot not found');

    await this.prisma.lot.update({
      where: { id: lotId },
      data: {
        status: LotStatus.REJECTED,
        rejectionReason: reason,
      },
    });

    await this.invalidateLotCache(lot.slug);
    await this.verticals.invalidateCatalogCache();

    this.events.log({
      type: 'lot.rejected',
      userId: adminId,
      entityId: lotId,
      entityType: 'lot',
      payload: { reason },
    });

    await this.notifications.notify({
      userId: lot.sellerId,
      title: 'Listing needs changes',
      body: reason,
      type: 'lot.rejected',
      metadata: { lotId },
      sendEmail: true,
      emailTemplate: 'lot_rejected',
      emailData: {
        lotTitle: lot.title,
        reason,
      },
    });

    return { success: true };
  }

  async softDeleteLot(adminId: string, lotId: string) {
    const lot = await this.prisma.lot.findFirst({
      where: { id: lotId, deletedAt: null },
    });
    if (!lot) throw new NotFoundException('Lot not found');

    await this.prisma.lot.update({
      where: { id: lotId },
      data: { deletedAt: new Date() },
    });

    const j1 = await this.auctionQueue.getJob(`auction-start-${lotId}`);
    const j2 = await this.auctionQueue.getJob(`auction-end-${lotId}`);
    await j1?.remove();
    await j2?.remove();

    await this.invalidateLotCache(lot.slug);
    await this.verticals.invalidateCatalogCache();

    void this.typesense.removeLot(lotId);
    this.indexNow.submitLotUrls(lot.slug);
    void this.feed.invalidate();
    void this.sitemap.invalidateAll();

    this.events.log({
      type: 'lot.deleted',
      userId: adminId,
      entityId: lotId,
      entityType: 'lot',
      payload: { soft: true },
    });

    return { success: true };
  }
}
