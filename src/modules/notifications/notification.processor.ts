import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuctionStatus, LotStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { EmailService } from './email.service';
import { NotificationsService } from './notifications.service';

@Processor('notification')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    try {
      switch (job.name) {
        case 'ending:soon':
          await this.handleEndingSoon();
          break;
        case 'daily:digest':
          await this.handleDailyDigest();
          break;
        default:
          this.logger.warn(`Unknown notification job: ${job.name}`);
      }
    } catch (err) {
      this.logger.error(
        `Notification job ${job.name} failed: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }

  private async handleEndingSoon(): Promise<void> {
    const threshold = new Date(Date.now() + 30 * 60 * 1000);

    const endingSoonLots = await this.prisma.lot.findMany({
      where: {
        deletedAt: null,
        auctionStatus: AuctionStatus.LIVE,
        status: LotStatus.ACTIVE,
        endDate: { lte: threshold, gt: new Date() },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        endDate: true,
        watchedBy: { select: { userId: true } },
      },
    });

    for (const lot of endingSoonLots) {
      const notifiedKey = `ending:notified:${lot.id}`;
      if (await this.redis.get(notifiedKey)) continue;

      for (const watcher of lot.watchedBy) {
        await this.notifications.notify({
          userId: watcher.userId,
          title: 'Auction ending soon',
          body: `${lot.title} ends in less than 30 minutes`,
          type: 'ending_soon',
          metadata: { lotId: lot.id, slug: lot.slug },
          sendEmail: true,
          emailTemplate: 'generic',
          emailData: {
            title: 'Auction ending soon',
            body: `${lot.title} ends soon. Don't miss out!`,
          },
        });
      }

      await this.redis.set(notifiedKey, '1', 'EX', 3600);
    }
  }

  private async handleDailyDigest(): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const base = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    const browseUrl = `${base}/en/browse`;

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        watchlist: { some: {} },
      },
      select: { id: true },
    });

    for (const u of users) {
      const prefsRow = await this.prisma.notificationPreferences.findUnique({
        where: { userId: u.id },
      });
      const allow = prefsRow?.newLotsInCategories ?? true;
      if (!allow) continue;

      const watched = await this.prisma.watchlistItem.findMany({
        where: { userId: u.id },
        select: { lot: { select: { categoryId: true } } },
      });
      const categoryIds = [...new Set(watched.map((w) => w.lot.categoryId))];
      if (categoryIds.length === 0) continue;

      const lots = await this.prisma.lot.findMany({
        where: {
          categoryId: { in: categoryIds },
          createdAt: { gte: since },
          deletedAt: null,
          status: LotStatus.ACTIVE,
        },
        take: 25,
        orderBy: { createdAt: 'desc' },
        select: { title: true, slug: true },
      });
      if (lots.length === 0) continue;

      const itemsHtml = lots
        .map(
          (l) => `<li><a href="${base}/en/lot/${l.slug}">${l.title}</a></li>`,
        )
        .join('');

      await this.emailService.send({
        userId: u.id,
        template: 'daily_digest',
        data: { itemsHtml, browseUrl },
      });
    }
  }
}
