import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiValidationErrorResponse } from '../../common/swagger/standard-responses';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Post('mangopay')
  @ApiOperation({ summary: 'Mangopay webhook (idempotent)' })
  @ApiResponse({ status: 200, description: 'Acknowledged' })
  @ApiValidationErrorResponse()
  async mangopay(
    @Body()
    body: {
      EventType?: string;
      ResourceId?: string;
      Id?: string;
      DebitedWalletId?: string;
    },
  ) {
    const eventId = body.Id ?? `${body.EventType}-${body.ResourceId}`;
    if (eventId) {
      const first = await this.payments.recordWebhookEvent(eventId);
      if (!first) {
        return { success: true, duplicate: true };
      }
    }
    if (body.EventType && body.ResourceId) {
      await this.payments.handleMangopayWebhookEvent(
        body.EventType,
        body.ResourceId,
      );
    }
    return { success: true };
  }
}
