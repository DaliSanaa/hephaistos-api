import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiValidationErrorResponse } from '../../common/swagger/standard-responses';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RegisterBankAccountDto } from './dto/bank-account.dto';
import { PaymentsService } from './payments.service';

@ApiTags('seller')
@Controller('seller')
export class SellerPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('transactions')
  @ApiOperation({ summary: 'Seller sales' })
  async transactions(@CurrentUser('sub') sellerId: string) {
    const data = await this.payments.listSellerTransactions(sellerId);
    return { success: true, data };
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Payout history' })
  async payouts(@CurrentUser('sub') sellerId: string) {
    const data = await this.payments.listSellerPayouts(sellerId);
    return { success: true, data };
  }

  @Post('bank-account')
  @ApiOperation({ summary: 'Register IBAN for payouts' })
  @ApiResponse({ status: 200, description: 'Bank account registered' })
  @ApiValidationErrorResponse()
  async bankAccount(
    @CurrentUser('sub') sellerId: string,
    @Body() dto: RegisterBankAccountDto,
  ) {
    const data = await this.payments.registerSellerBankAccount(sellerId, dto);
    return { success: true, data };
  }
}
