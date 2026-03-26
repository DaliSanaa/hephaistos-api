import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { SearchModule } from '../search/search.module';
import { AuctionProcessor } from './auction.processor';
import { AuctionsController } from './auctions.controller';
import { AuctionsGateway } from './auctions.gateway';
import { AuctionsService } from './auctions.service';
import { BidService } from './bid.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'auctions',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    }),
    BullModule.registerQueue({
      name: 'payment',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    }),
    forwardRef(() => NotificationsModule),
    PaymentsModule,
    forwardRef(() => SearchModule),
  ],
  controllers: [AuctionsController],
  providers: [AuctionsService, BidService, AuctionsGateway, AuctionProcessor],
  exports: [AuctionsService, BidService, AuctionsGateway, BullModule],
})
export class AuctionsModule {}
