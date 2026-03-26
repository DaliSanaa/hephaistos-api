import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { TypesenseService } from './typesense.service';

@Processor('search')
export class SearchProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchProcessor.name);

  constructor(private readonly typesense: TypesenseService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'search:full-sync') {
      this.logger.log('Starting Typesense full sync job');
      await this.typesense.syncAllLots();
      return;
    }
    this.logger.warn(`Unknown search job: ${job.name}`);
  }
}
