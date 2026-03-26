import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaProcessor } from './media.processor';
import { MediaService } from './media.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'media',
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
      },
    }),
  ],
  controllers: [MediaController],
  providers: [MediaService, MediaProcessor],
  exports: [MediaService],
})
export class MediaModule {}
