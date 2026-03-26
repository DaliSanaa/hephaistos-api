import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';

@Injectable()
export class ScheduledTasksService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    @InjectQueue('notification') private readonly notificationQueue: Queue,
    @InjectQueue('maintenance') private readonly maintenanceQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    if (this.config.get<boolean>('DISABLE_CRON_JOBS') === true) {
      this.logger.log('Cron jobs disabled (DISABLE_CRON_JOBS=true)');
      return;
    }

    const repeatOpts = {
      ending: { pattern: '* * * * *' as const },
      digest: { pattern: '0 8 * * *' as const },
      cache: { pattern: '*/5 * * * *' as const },
      weekly: { pattern: '0 3 * * 0' as const },
    };

    try {
      await this.notificationQueue.add(
        'ending:soon',
        {},
        {
          repeat: repeatOpts.ending,
          jobId: 'ending:soon:cron',
        },
      );

      await this.notificationQueue.add(
        'daily:digest',
        {},
        {
          repeat: repeatOpts.digest,
          jobId: 'daily:digest:cron',
        },
      );

      await this.maintenanceQueue.add(
        'cache:warm',
        {},
        {
          repeat: repeatOpts.cache,
          jobId: 'cache:warm:cron',
        },
      );

      await this.maintenanceQueue.add(
        'events:cleanup',
        {},
        {
          repeat: repeatOpts.weekly,
          jobId: 'events:cleanup:cron',
        },
      );

      this.logger.log(
        'Registered BullMQ repeatable jobs (notification + maintenance)',
      );
    } catch (err) {
      this.logger.error(
        `Failed to register repeatable jobs: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
