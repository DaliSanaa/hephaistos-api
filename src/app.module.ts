import { BullModule } from '@nestjs/bullmq';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import Redis from 'ioredis';
import { EnvConfigModule } from './common/config/env.config';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { AdminModule } from './modules/admin/admin.module';
import { AuctionsModule } from './modules/auctions/auctions.module';
import { AuthModule } from './modules/auth/auth.module';
import { EventsModule } from './modules/events/events.module';
import { LotsModule } from './modules/lots/lots.module';
import { MediaModule } from './modules/media/media.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SearchModule } from './modules/search/search.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { UsersModule } from './modules/users/users.module';
import { VerticalsModule } from './modules/verticals/verticals.module';
import { WatchlistModule } from './modules/watchlist/watchlist.module';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
  imports: [
    EnvConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: new Redis(config.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: null,
        }),
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    EventsModule,
    AuthModule,
    UsersModule,
    VerticalsModule,
    LotsModule,
    AuctionsModule,
    PaymentsModule,
    TransactionsModule,
    WatchlistModule,
    NotificationsModule,
    SearchModule,
    MediaModule,
    AdminModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
