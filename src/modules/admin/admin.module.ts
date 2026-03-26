import { Module } from '@nestjs/common';
import { AuctionsModule } from '../auctions/auctions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { LotsModule } from '../lots/lots.module';
import { AdminAuctionsController } from './admin-auctions.controller';
import { AdminAuctionsService } from './admin-auctions.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminEventsController } from './admin-events.controller';
import { AdminEventsService } from './admin-events.service';
import { AdminFlagsController } from './admin-flags.controller';
import { AdminFlagsService } from './admin-flags.service';
import { AdminLotsController } from './admin-lots.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [LotsModule, PaymentsModule, AuctionsModule, NotificationsModule],
  controllers: [
    AdminUsersController,
    AdminDashboardController,
    AdminAuctionsController,
    AdminFlagsController,
    AdminEventsController,
    AdminLotsController,
    AdminPaymentsController,
  ],
  providers: [
    AdminUsersService,
    AdminDashboardService,
    AdminAuctionsService,
    AdminFlagsService,
    AdminEventsService,
    RolesGuard,
  ],
  exports: [AdminUsersService],
})
export class AdminModule {}
