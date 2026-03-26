import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuctionsModule } from '../auctions/auctions.module';
import { VerticalsModule } from '../verticals/verticals.module';
import { EmailService } from './email.service';
import { MaintenanceProcessor } from './maintenance.processor';
import { NotificationProcessor } from './notification.processor';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ScheduledTasksService } from './scheduled-tasks.service';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AuctionsModule),
    VerticalsModule,
    BullModule.registerQueue({
      name: 'notification',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    }),
    BullModule.registerQueue({
      name: 'maintenance',
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
      },
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    EmailService,
    NotificationsService,
    NotificationProcessor,
    MaintenanceProcessor,
    ScheduledTasksService,
  ],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}
