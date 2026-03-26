import { Module, forwardRef } from '@nestjs/common';
import { AuctionsModule } from '../auctions/auctions.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SearchModule } from '../search/search.module';
import { VerticalsModule } from '../verticals/verticals.module';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { LotsController } from './lots.controller';
import { LotsService } from './lots.service';
import { SellerLotsController } from './seller-lots.controller';

@Module({
  imports: [
    forwardRef(() => AuctionsModule),
    AuthModule,
    VerticalsModule,
    NotificationsModule,
    forwardRef(() => SearchModule),
  ],
  controllers: [LotsController, SellerLotsController],
  providers: [LotsService, OptionalJwtAuthGuard],
  exports: [LotsService],
})
export class LotsModule {}
