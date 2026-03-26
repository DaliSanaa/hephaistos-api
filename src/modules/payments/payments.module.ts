import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MangopayPaymentProvider } from './mangopay-payment.provider';
import { MangopayService } from './mangopay.service';
import { MockPaymentProvider } from './mock-payment.provider';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { PaymentProcessor } from './payment.processor';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { SellerPaymentsController } from './seller-payments.controller';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'payment',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    }),
    NotificationsModule,
  ],
  controllers: [
    PaymentsController,
    WebhookController,
    SellerPaymentsController,
  ],
  providers: [
    MangopayService,
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (
        config: ConfigService,
        queue: Queue,
        prisma: PrismaService,
        mangopay: MangopayService,
      ) => {
        if (config.get<boolean>('ENABLE_MANGOPAY')) {
          return new MangopayPaymentProvider(mangopay);
        }
        return new MockPaymentProvider(queue, prisma);
      },
      inject: [
        ConfigService,
        getQueueToken('payment'),
        PrismaService,
        MangopayService,
      ],
    },
    PaymentsService,
    PaymentProcessor,
  ],
  exports: [PaymentsService, PAYMENT_PROVIDER, BullModule],
})
export class PaymentsModule {}
