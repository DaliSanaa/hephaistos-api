import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiValidationErrorResponse } from '../../common/swagger/standard-responses';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateDisputeDto } from '../payments/dto/dispute.dto';
import { PaymentsService } from '../payments/payments.service';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get(':id/payment-details')
  @ApiOperation({ summary: 'Bank wire instructions (buyer)' })
  @ApiResponse({ status: 200, description: 'Wire instructions' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async paymentDetails(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ) {
    const data = await this.payments.getPaymentDetails(id, userId);
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Transaction detail (buyer or seller)' })
  @ApiResponse({ status: 200, description: 'Transaction' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async detail(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    const data = await this.payments.getTransactionForParticipant(id, userId);
    return { success: true, data };
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Buyer confirms receipt' })
  @ApiResponse({ status: 200, description: 'Confirmed' })
  async confirm(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    await this.payments.confirmReceipt(id, userId);
    return { success: true };
  }

  @Post(':id/dispute')
  @ApiOperation({ summary: 'Buyer opens dispute' })
  @ApiResponse({ status: 200, description: 'Dispute created' })
  @ApiValidationErrorResponse()
  async dispute(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: CreateDisputeDto,
  ) {
    await this.payments.raiseDispute(id, userId, dto);
    return { success: true };
  }
}
