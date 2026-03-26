import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuctionStatus, LotStatus, UserRole } from '@prisma/client';
import type { Queue } from 'bullmq';
import { decodeCursor, encodeCursor } from '../../common/utils/cursor';
import { getBidIncrement } from '../../common/utils/bid-increment';
import { EventService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import type { BidHistoryQueryDto } from '../lots/dto/bid-history-query.dto';
import { PaymentsService } from '../payments/payments.service';
import { TypesenseService } from '../search/typesense.service';
import { AuctionsGateway } from './auctions.gateway';

const SNIPE_WINDOW_MS = 2 * 60 * 1000;
const EXTENSION_MS = 2 * 60 * 1000;

function bidderDisplay(firstName: string, lastName: string): string {
  const li = lastName.trim();
  const initial = li.length ? li[0].toUpperCase() : '';
  return `${firstName.trim()} ${initial}.`.trim();
}

function countTwoUserAlternations(ids: string[]): number {
  if (ids.length < 2) return 0;
  const unique = new Set(ids);
  if (unique.size !== 2) return 0;
  let alt = 0;
  for (let i = 1; i < ids.length; i++) {
    if (ids[i] !== ids[i - 1]) alt++;
  }
  return alt;
}

@Injectable()
export class BidService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: EventService,
    private readonly notifications: NotificationsService,
    private readonly gateway: AuctionsGateway,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => TypesenseService))
    private readonly typesense: TypesenseService,
    @InjectQueue('auctions') private readonly auctionQueue: Queue,
  ) {}

  async placeBid(
    slug: string,
    userId: string,
    amount: number,
    ip: string,
    userAgent: string,
  ) {
    const lockKey = `auction:lock:${slug}`;
    const locked = await this.redis.setNxEx(lockKey, '1', 5);
    if (!locked) {
      throw new ConflictException('Another bid is being processed. Try again.');
    }

    try {
      const lot = await this.prisma.lot.findFirst({
        where: { slug, deletedAt: null },
        include: { seller: true },
      });

      if (!lot) throw new NotFoundException('Lot not found');
      if (lot.auctionStatus !== AuctionStatus.LIVE) {
        throw new BadRequestException('Auction is not live');
      }
      if (lot.status !== LotStatus.ACTIVE) {
        throw new BadRequestException('Lot is not active');
      }
      if (new Date() > lot.endDate) {
        throw new BadRequestException('Auction has ended');
      }
      if (lot.sellerId === userId) {
        throw new ForbiddenException('Cannot bid on your own lot');
      }

      const minBid =
        lot.currentBid === 0
          ? lot.startingPrice
          : lot.currentBid + getBidIncrement(lot.currentBid);

      if (amount < minBid) {
        throw new BadRequestException(`Minimum bid is ${minBid}`);
      }

      if (lot.bidCount > 0) {
        const lastBid = await this.prisma.bid.findFirst({
          where: { lotId: lot.id },
          orderBy: { createdAt: 'desc' },
        });
        if (lastBid?.userId === userId) {
          throw new BadRequestException('You are already the highest bidder');
        }
      }

      void this.checkShillIndicators(lot, userId, ip, amount);

      await this.payments.assertBidAllowed(userId, amount);

      const bid = await this.prisma.bid.create({
        data: {
          lotId: lot.id,
          userId,
          amount,
          ip,
          userAgent,
        },
      });

      await this.prisma.lot.update({
        where: { id: lot.id },
        data: {
          currentBid: amount,
          bidCount: { increment: 1 },
          winnerId: userId,
        },
      });

      void this.typesense.updateBidFields(lot.id, {
        currentBid: amount,
        bidCount: lot.bidCount + 1,
      });

      const newEndDate = await this.checkAntiSnipe(lot, amount);

      await this.redis.del(`lot:${slug}`);
      const endIso = newEndDate?.toISOString() ?? lot.endDate.toISOString();
      await this.redis.set(
        `bid:current:${lot.id}`,
        JSON.stringify({
          amount,
          userId,
          bidCount: lot.bidCount + 1,
          endDate: endIso,
        }),
        'EX',
        300,
      );

      const prevHighest = await this.prisma.bid.findFirst({
        where: { lotId: lot.id, id: { not: bid.id } },
        orderBy: { amount: 'desc' },
      });
      if (prevHighest && prevHighest.userId !== userId) {
        const base = (
          this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
        ).replace(/\/$/, '');
        const lotUrl = `${base}/en/lot/${lot.slug}`;
        await this.notifications.notify({
          userId: prevHighest.userId,
          title: 'You were outbid',
          body: `Someone placed a higher bid on ${lot.title}.`,
          type: 'outbid',
          metadata: { lotId: lot.id, slug: lot.slug },
          sendEmail: true,
          emailTemplate: 'outbid',
          emailData: {
            lotTitle: lot.title,
            currentBid: amount,
            lotUrl,
          },
        });
      }

      const bidder = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      const bidderName = bidder
        ? bidderDisplay(bidder.firstName, bidder.lastName)
        : 'Bidder';

      this.gateway.broadcastBid(lot.id, {
        event: 'bid:placed',
        lotId: lot.id,
        slug: lot.slug,
        amount,
        bidCount: lot.bidCount + 1,
        userId,
        endDate: endIso,
        bidderName,
      });

      this.events.log({
        type: 'bid.placed',
        userId,
        entityId: lot.id,
        entityType: 'lot',
        payload: {
          amount,
          bidCount: lot.bidCount + 1,
          previousBid: lot.currentBid,
        },
        ip,
        userAgent,
      });

      return bid;
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private async checkAntiSnipe(
    lot: { id: string; endDate: Date },
    bidAmount: number,
  ): Promise<Date | null> {
    const now = Date.now();
    const endTime = lot.endDate.getTime();
    const timeLeft = endTime - now;

    if (timeLeft > 0 && timeLeft <= SNIPE_WINDOW_MS) {
      const newEndDate = new Date(now + EXTENSION_MS);

      await this.prisma.lot.update({
        where: { id: lot.id },
        data: { endDate: newEndDate },
      });

      const oldJob = await this.auctionQueue.getJob(`auction-end-${lot.id}`);
      await oldJob?.remove();
      await this.auctionQueue.add(
        'auction:end',
        { lotId: lot.id },
        {
          jobId: `auction-end-${lot.id}`,
          delay: Math.max(0, newEndDate.getTime() - Date.now()),
        },
      );

      void this.typesense.updateEndDate(lot.id, newEndDate);

      this.events.log({
        type: 'auction.extended',
        entityId: lot.id,
        entityType: 'lot',
        payload: {
          newEndDate: newEndDate.toISOString(),
          triggeredByBid: bidAmount,
        },
      });

      this.gateway.broadcastAuctionExtended(lot.id, {
        lotId: lot.id,
        newEndDate: newEndDate.toISOString(),
      });

      return newEndDate;
    }

    return null;
  }

  private checkShillIndicators(
    lot: {
      id: string;
      title: string;
      sellerId: string;
      currentBid: number;
    },
    userId: string,
    ip: string,
    bidAmount: number,
  ): void {
    setImmediate(() => {
      void this.runShillFlags(lot, userId, ip, bidAmount);
    });
  }

  private async runShillFlags(
    lot: {
      id: string;
      title: string;
      sellerId: string;
      currentBid: number;
    },
    userId: string,
    ip: string,
    bidAmount: number,
  ) {
    const flags: string[] = [];

    const seller = await this.prisma.user.findUnique({
      where: { id: lot.sellerId },
    });
    if (seller?.lastLoginIp && seller.lastLoginIp === ip) {
      flags.push('same_ip_as_seller');
    }

    const recentBids = await this.prisma.bid.findMany({
      where: { lotId: lot.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { userId: true },
    });
    const chron = recentBids.map((b) => b.userId).reverse();
    if (countTwoUserAlternations(chron) > 5) {
      flags.push('rapid_alternation');
    }

    const bidder = await this.prisma.user.findUnique({ where: { id: userId } });
    if (bidder) {
      const ageHours = (Date.now() - bidder.createdAt.getTime()) / 3_600_000;
      if (ageHours < 24 && bidAmount > 1_000_000) {
        flags.push('new_account_high_value');
      }
    }

    const sameIpOthers = await this.prisma.bid.findMany({
      where: {
        lotId: lot.id,
        ip,
        userId: { not: userId },
      },
      distinct: ['userId'],
      select: { userId: true },
    });
    if (sameIpOthers.length > 0) {
      flags.push('multi_account_same_ip');
    }

    if (flags.length === 0) return;

    this.events.log({
      type: 'shill.flagged',
      userId,
      entityId: lot.id,
      entityType: 'lot',
      payload: { flags, ip },
    });

    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN, deletedAt: null },
    });
    for (const admin of admins) {
      await this.prisma.notification.create({
        data: {
          userId: admin.id,
          title: 'Shill bidding alert',
          body: `Potential shill activity on lot ${lot.title}: ${flags.join(', ')}`,
          type: 'system',
          metadata: { lotId: lot.id, flags },
        },
      });
    }
  }

  async getBidHistory(slug: string, query: BidHistoryQueryDto) {
    const lot = await this.prisma.lot.findFirst({
      where: { slug, deletedAt: null },
    });
    if (!lot) throw new NotFoundException('Lot not found');

    const limit = query.limit ?? 20;
    const cursorId = query.cursor ? decodeCursor(query.cursor).id : undefined;

    const [items, total] = await Promise.all([
      this.prisma.bid.findMany({
        where: { lotId: lot.id },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.bid.count({ where: { lotId: lot.id } }),
    ]);

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? encodeCursor(page[page.length - 1].id, '')
      : null;

    return {
      items: page.map((b) => ({
        id: b.id,
        amount: b.amount,
        createdAt: b.createdAt.toISOString(),
        bidder: {
          firstName: b.user.firstName,
          lastInitial: b.user.lastName.trim()[0]
            ? `${b.user.lastName.trim()[0].toUpperCase()}.`
            : '',
        },
      })),
      nextCursor,
      totalCount: total,
    };
  }

  async getMyActiveBids(userId: string) {
    const lots = await this.prisma.lot.findMany({
      where: {
        deletedAt: null,
        status: LotStatus.ACTIVE,
        auctionStatus: AuctionStatus.LIVE,
        bids: { some: { userId } },
      },
      include: {
        category: { select: { slug: true, labelKey: true } },
        location: { select: { city: true, countryCode: true } },
        images: { where: { isPrimary: true }, take: 1 },
      },
    });

    const winning: Array<{
      lot: Record<string, unknown>;
      myBid: number;
      currentBid: number;
    }> = [];
    const outbid: typeof winning = [];

    for (const lot of lots) {
      const agg = await this.prisma.bid.aggregate({
        where: { lotId: lot.id, userId },
        _max: { amount: true },
      });
      const myBid = agg._max.amount ?? 0;
      const summary = {
        id: lot.id,
        slug: lot.slug,
        title: lot.title,
        endDate: lot.endDate.toISOString(),
        currentBid: lot.currentBid,
        category: lot.category,
        location: lot.location,
        primaryImage: lot.images[0]?.url ?? null,
      };

      if (lot.winnerId === userId) {
        winning.push({ lot: summary, myBid, currentBid: lot.currentBid });
      } else {
        outbid.push({ lot: summary, myBid, currentBid: lot.currentBid });
      }
    }

    return { winning, outbid };
  }
}
