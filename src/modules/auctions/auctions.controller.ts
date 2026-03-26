import { Controller } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

/** Bidding HTTP routes live under `lots` (see tag `auctions` there). */
@ApiExcludeController()
@Controller('auctions')
export class AuctionsController {}
