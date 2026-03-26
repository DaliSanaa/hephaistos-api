import { Injectable, NotFoundException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from '../../common/utils/cursor';
import { EventService } from '../events/events.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { WatchlistQueryDto } from './dto/watchlist-query.dto';

@Injectable()
export class WatchlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
  ) {}

  async list(userId: string, query: WatchlistQueryDto) {
    const limit = Math.min(query.limit ?? 20, 50);
    const cursorId = query.cursor ? decodeCursor(query.cursor).id : undefined;

    const [rows, total] = await Promise.all([
      this.prisma.watchlistItem.findMany({
        where: {
          userId,
          lot: { deletedAt: null },
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        include: {
          lot: {
            select: {
              id: true,
              slug: true,
              title: true,
              brand: true,
              model: true,
              year: true,
              condition: true,
              currentBid: true,
              bidCount: true,
              endDate: true,
              auctionStatus: true,
              images: {
                where: { isPrimary: true },
                take: 1,
                select: { url: true },
              },
              location: {
                select: { city: true, country: true },
              },
              category: { select: { slug: true, labelKey: true } },
            },
          },
        },
      }),
      this.prisma.watchlistItem.count({
        where: {
          userId,
          lot: { deletedAt: null },
        },
      }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? encodeCursor(page[page.length - 1].id, '')
      : null;

    const items = page.map((w) => {
      const lot = w.lot;
      const primary = lot.images[0]?.url ?? '';
      return {
        id: w.id,
        lotId: lot.id,
        addedAt: w.createdAt.toISOString(),
        lot: {
          slug: lot.slug,
          title: lot.title,
          brand: lot.brand,
          model: lot.model,
          year: lot.year,
          condition: lot.condition,
          currentBid: lot.currentBid,
          bidCount: lot.bidCount,
          endDate: lot.endDate.toISOString(),
          auctionStatus: lot.auctionStatus,
          image: primary,
          location: {
            city: lot.location?.city ?? '',
            country: lot.location?.country ?? '',
          },
          category: lot.category,
        },
      };
    });

    return {
      items,
      nextCursor,
      totalCount: total,
    };
  }

  async add(userId: string, lotSlug: string): Promise<void> {
    const lot = await this.prisma.lot.findFirst({
      where: { slug: lotSlug, deletedAt: null },
    });
    if (!lot) throw new NotFoundException('Lot not found');

    const existing = await this.prisma.watchlistItem.findUnique({
      where: { userId_lotId: { userId, lotId: lot.id } },
    });
    if (existing) return;

    await this.prisma.watchlistItem.create({
      data: { userId, lotId: lot.id },
    });

    this.events.log({
      type: 'watchlist.added',
      userId,
      entityId: lot.id,
      entityType: 'lot',
      payload: { slug: lotSlug },
    });
  }

  async remove(userId: string, lotSlug: string): Promise<void> {
    const lot = await this.prisma.lot.findFirst({
      where: { slug: lotSlug, deletedAt: null },
    });
    if (!lot) throw new NotFoundException('Lot not found');

    await this.prisma.watchlistItem.deleteMany({
      where: { userId, lotId: lot.id },
    });

    this.events.log({
      type: 'watchlist.removed',
      userId,
      entityId: lot.id,
      entityType: 'lot',
      payload: { slug: lotSlug },
    });
  }

  async check(userId: string, lotSlug: string): Promise<{ watching: boolean }> {
    const lot = await this.prisma.lot.findFirst({
      where: { slug: lotSlug, deletedAt: null },
      select: { id: true },
    });
    if (!lot) throw new NotFoundException('Lot not found');

    const row = await this.prisma.watchlistItem.findUnique({
      where: { userId_lotId: { userId, lotId: lot.id } },
    });
    return { watching: !!row };
  }
}
