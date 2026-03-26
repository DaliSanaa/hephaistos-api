import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

/** Placeholder for Sharp-based thumbnails — originals used until implemented. */
@Processor('media')
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  async process(job: Job<{ key: string }>): Promise<void> {
    if (job.name === 'image:process') {
      this.logger.debug(`image:process deferred for key=${job.data.key}`);
      await Promise.resolve();
      return;
    }
    this.logger.warn(`Unknown media job: ${job.name}`);
  }
}
