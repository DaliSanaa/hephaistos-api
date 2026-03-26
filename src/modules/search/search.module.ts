import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LotsModule } from '../lots/lots.module';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { FeedService } from './feed.service';
import { IndexNowService } from './indexnow.service';
import { SearchController } from './search.controller';
import { SearchProcessor } from './search.processor';
import { SearchService } from './search.service';
import { SitemapService } from './sitemap.service';
import { TypesenseService } from './typesense.service';

@Module({
  imports: [
    forwardRef(() => LotsModule),
    AuthModule,
    BullModule.registerQueue({
      name: 'search',
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
      },
    }),
  ],
  controllers: [SearchController],
  providers: [
    TypesenseService,
    SearchService,
    FeedService,
    SitemapService,
    IndexNowService,
    SearchProcessor,
    OptionalJwtAuthGuard,
  ],
  exports: [
    TypesenseService,
    SearchService,
    FeedService,
    SitemapService,
    IndexNowService,
  ],
})
export class SearchModule {}
