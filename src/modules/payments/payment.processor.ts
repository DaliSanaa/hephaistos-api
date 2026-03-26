import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { KycStatus, PayoutStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from './payments.service';

@Processor('payment')
export class PaymentProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    try {
      switch (job.name) {
        case 'payment:deadline':
          await this.payments.handleNonPayment(
            (job.data as { transactionId: string }).transactionId,
          );
          break;
        case 'inspection:deadline':
          await this.payments.handleInspectionDeadline(
            (job.data as { transactionId: string }).transactionId,
          );
          break;
        case 'mock:card-validated':
          await this.handleMockCard(
            job.data as { externalUserId: string; validationId: string },
          );
          break;
        case 'mock:kyc-verified':
          await this.handleMockKyc(
            job.data as { externalUserId: string; documentId: string },
          );
          break;
        case 'mock:payin-succeeded':
          await this.handleMockPayIn(
            job.data as { payInId: string; amountCents: number },
          );
          break;
        case 'mock:payout-succeeded':
          await this.handleMockPayout(job.data as { payoutId: string });
          break;
        default:
          this.logger.warn(`Unknown payment job: ${job.name}`);
      }
    } catch (err) {
      this.logger.error(
        `Payment job ${job.name} failed: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }

  private async handleMockCard(data: {
    externalUserId: string;
    validationId: string;
  }) {
    await this.prisma.user.updateMany({
      where: { mangopayUserId: data.externalUserId },
      data: { cardValidated: true },
    });
  }

  private async handleMockKyc(data: {
    externalUserId: string;
    documentId: string;
  }) {
    await this.prisma.user.updateMany({
      where: { mangopayUserId: data.externalUserId },
      data: { kycStatus: KycStatus.VERIFIED },
    });
  }

  private async handleMockPayIn(data: { payInId: string }) {
    await this.payments.processPayInSucceeded(data.payInId);
  }

  private async handleMockPayout(data: { payoutId: string }) {
    await this.prisma.payout.updateMany({
      where: { mangopayPayoutId: data.payoutId },
      data: { status: PayoutStatus.COMPLETED, completedAt: new Date() },
    });
  }
}
