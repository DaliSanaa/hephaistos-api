import { Controller } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

/** Payment flows use `transactions` and Mangopay webhooks. */
@ApiExcludeController()
@Controller('payments')
export class PaymentsController {}
