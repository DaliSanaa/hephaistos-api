import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiValidationErrorResponse } from '../../common/swagger/standard-responses';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminPayoutsQueryDto } from './dto/admin-payouts-query.dto';
import { ResolveDisputeDto } from '../payments/dto/dispute.dto';
import { PaymentsService } from '../payments/payments.service';

@ApiTags('admin')
@Controller('admin')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('transactions')
  @ApiOperation({ summary: 'All transactions' })
  async transactions() {
    const data = await this.payments.listAllTransactions();
    return { success: true, data };
  }

  @Get('disputes')
  @ApiOperation({ summary: 'All disputes' })
  async disputes() {
    const data = await this.payments.listAllDisputes();
    return { success: true, data };
  }

  @Get('payouts')
  @ApiOperation({ summary: 'All payouts (filterable by status)' })
  async payouts(@Query() query: AdminPayoutsQueryDto) {
    const data = await this.payments.listAdminPayouts(query.status);
    return { success: true, data };
  }

  @Post('payouts/:id/retry')
  @ApiOperation({ summary: 'Retry a failed payout' })
  async retryPayout(
    @CurrentUser('sub') adminId: string,
    @Param('id') id: string,
  ) {
    return this.payments.retryFailedPayout(adminId, id);
  }

  @Patch('disputes/:id/resolve')
  @ApiOperation({ summary: 'Resolve dispute' })
  @ApiValidationErrorResponse()
  async resolve(
    @CurrentUser('sub') adminId: string,
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.payments.resolveDispute(id, adminId, dto);
  }
}
