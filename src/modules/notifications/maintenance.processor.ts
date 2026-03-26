import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { LotStatus, AuctionStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import { EventService } from '../events/events.service';
import { VerticalsService } from '../verticals/verticals.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Processor('maintenance')
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly verticals: VerticalsService,
    private readonly events: EventService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    try {
      switch (job.name) {
        case 'cache:warm':
          await this.warmCache();
          break;
        case 'events:cleanup':
          await this.archiveEventsMarker();
          break;
        default:
          this.logger.warn(`Unknown maintenance job: ${job.name}`);
      }
    } catch (err) {
      this.logger.error(
        `Maintenance job ${job.name} failed: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }

  private async warmCache(): Promise<void> {
    await this.verticals.invalidateCatalogCache();
    await this.verticals.findAllVerticals();
    await this.verticals.findAllCategoriesFlat();

    const endingSoon = await this.prisma.lot.findMany({
      where: {
        deletedAt: null,
        status: LotStatus.ACTIVE,
        auctionStatus: AuctionStatus.LIVE,
        endDate: { gt: new Date() },
      },
      orderBy: { endDate: 'asc' },
      take: 24,
      select: { id: true, slug: true },
    });

    await this.redis.set(
      'maintenance:cache_warm_last',
      JSON.stringify({
        at: new Date().toISOString(),
        endingSoonSample: endingSoon.length,
      }),
      'EX',
      600,
    );
  }

  /** Policy: never delete events — record eligibility for future archival export. */
  private async archiveEventsMarker(): Promise<void> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const eligible = await this.prisma.event.count({
      where: { createdAt: { lt: cutoff } },
    });
    this.events.log({
      type: 'maintenance.events_cleanup',
      payload: {
        eligibleForArchiveCount: eligible,
        cutoffIso: cutoff.toISOString(),
        note: 'no_delete_per_policy',
      },
    });
  }
}
