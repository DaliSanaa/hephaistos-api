import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { DisputeService } from './dispute.service';
import { EscrowService } from './escrow.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [PaymentsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, EscrowService, DisputeService],
  exports: [TransactionsService, EscrowService, DisputeService],
})
export class TransactionsModule {}
