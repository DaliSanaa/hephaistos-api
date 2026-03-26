import {
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { decodeCursor, encodeCursor } from '../../common/utils/cursor';
import { AuctionsGateway } from '../auctions/auctions.gateway';
import { EmailService } from './email.service';

export type NotifyParams = {
  userId: string;
  title: string;
  body: string;
  type: string;
  metadata?: Record<string, unknown>;
  sendEmail?: boolean;
  emailTemplate?: string;
  emailData?: Record<string, unknown>;
};

type EmailPrefs = {
  outbid: boolean;
  endingSoon: boolean;
  newLotsInCategories: boolean;
  wonAuction: boolean;
  paymentConfirmation: boolean;
};

const DEFAULT_PREFS: EmailPrefs = {
  outbid: true,
  endingSoon: true,
  newLotsInCategories: true,
  wonAuction: true,
  paymentConfirmation: true,
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => AuctionsGateway))
    private readonly auctionsGateway: AuctionsGateway,
  ) {}

  /** Legacy helper — in-app only; use {@link notify} for email + WebSocket. */
  async create(
    userId: string,
    title: string,
    body: string,
    type?: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.notify({
      userId,
      title,
      body,
      type: type ?? 'system',
      metadata,
      sendEmail: false,
    });
  }

  async notify(params: NotifyParams) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        title: params.title,
        body: params.body,
        type: params.type,
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await this.invalidateUnreadCache(params.userId);

    this.auctionsGateway.server
      .to(`user:${params.userId}`)
      .emit('notification:new', {
        id: notification.id,
        title: params.title,
        body: params.body,
        type: params.type,
      });

    if (params.sendEmail) {
      const prefs = await this.getNotificationPrefs(params.userId);
      if (this.shouldSendEmail(params.type, prefs)) {
        await this.emailService.send({
          userId: params.userId,
          template: params.emailTemplate ?? 'generic',
          data: params.emailData ?? {
            title: params.title,
            body: params.body,
          },
        });
      }
    }

    return notification;
  }

  private async getNotificationPrefs(userId: string): Promise<EmailPrefs> {
    const row = await this.prisma.notificationPreferences.findUnique({
      where: { userId },
    });
    if (row) {
      return {
        outbid: row.outbid,
        endingSoon: row.endingSoon,
        newLotsInCategories: row.newLotsInCategories,
        wonAuction: row.wonAuction,
        paymentConfirmation: row.paymentConfirmation,
      };
    }
    return { ...DEFAULT_PREFS };
  }

  private shouldSendEmail(type: string, prefs: EmailPrefs): boolean {
    const key = this.emailPrefKey(type);
    if (!key) return true;
    return prefs[key];
  }

  /** Maps notification type (including legacy dotted names) to preference column. */
  private emailPrefKey(type: string): keyof EmailPrefs | null {
    const t = type.toLowerCase();
    if (t === 'bid.outbid' || t === 'outbid') return 'outbid';
    if (t === 'ending_soon') return 'endingSoon';
    if (
      t === 'auction.won' ||
      t === 'won' ||
      t === 'auction.sold' ||
      t === 'auction.ended'
    ) {
      return 'wonAuction';
    }
    if (
      t.startsWith('payment') ||
      t === 'payment.received' ||
      t === 'payout' ||
      t === 'payment'
    ) {
      return 'paymentConfirmation';
    }
    return null;
  }

  private async invalidateUnreadCache(userId: string): Promise<void> {
    await this.redis.del(`notifications:unread:${userId}`);
  }

  async getUnreadCountCached(userId: string): Promise<number> {
    const key = `notifications:unread:${userId}`;
    const cached = await this.redis.get(key);
    if (cached !== null) return parseInt(cached, 10);
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });
    await this.redis.set(key, String(count), 'EX', 60);
    return count;
  }

  async listForUser(userId: string, opts: { limit?: number; cursor?: string }) {
    const limit = Math.min(opts.limit ?? 20, 50);
    const cursorId = opts.cursor ? decodeCursor(opts.cursor).id : undefined;

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.getUnreadCountCached(userId),
    ]);

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? encodeCursor(page[page.length - 1].id, '')
      : null;

    return {
      items: page.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        type: this.normalizeNotificationType(n.type),
        read: n.read,
        metadata: (n.metadata as Record<string, unknown> | null) ?? {},
        createdAt: n.createdAt.toISOString(),
      })),
      nextCursor,
      totalCount: total,
      unreadCount,
    };
  }

  private normalizeNotificationType(
    type: string | null,
  ): 'outbid' | 'ending_soon' | 'won' | 'payment' | 'payout' | 'system' {
    if (!type) return 'system';
    const t = type.toLowerCase();
    if (t === 'bid.outbid' || t === 'outbid') return 'outbid';
    if (t === 'ending_soon') return 'ending_soon';
    if (t === 'auction.won' || t === 'won') return 'won';
    if (t.startsWith('payment') || t === 'payment.received') return 'payment';
    if (t === 'payout' || t.includes('payout')) return 'payout';
    return 'system';
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const r = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, read: false },
      data: { read: true },
    });
    if (r.count === 0) {
      const exists = await this.prisma.notification.findFirst({
        where: { id: notificationId, userId },
      });
      if (!exists) throw new NotFoundException('Notification not found');
    }
    await this.invalidateUnreadCache(userId);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    await this.invalidateUnreadCache(userId);
  }

  async deleteNotification(
    userId: string,
    notificationId: string,
  ): Promise<void> {
    const r = await this.prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
    if (r.count === 0) throw new NotFoundException('Notification not found');
    await this.invalidateUnreadCache(userId);
  }
}
