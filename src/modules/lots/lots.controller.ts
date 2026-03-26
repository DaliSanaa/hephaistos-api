import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiValidationErrorResponse } from '../../common/swagger/standard-responses';
import { BidService } from '../auctions/bid.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import type { AuthUserPayload } from '../../common/types/auth-user';
import { BidHistoryQueryDto } from './dto/bid-history-query.dto';
import { BrowseLotsDto } from './dto/browse-lots.dto';
import { CreateLotDto } from './dto/create-lot.dto';
import { PlaceBidDto } from './dto/place-bid.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { LotsService } from './lots.service';

@ApiTags('lots')
@Controller('lots')
export class LotsController {
  constructor(
    private readonly lots: LotsService,
    private readonly bids: BidService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Browse active lots (cursor pagination)' })
  @ApiResponse({ status: 200, description: 'Paginated lots' })
  @ApiValidationErrorResponse()
  async browse(@Query() query: BrowseLotsDto) {
    const data = await this.lots.browseLots(query);
    return { success: true, data };
  }

  @Public()
  @ApiTags('auctions')
  @Get(':slug/bids')
  @ApiOperation({ summary: 'Bid history (cursor)' })
  @ApiResponse({ status: 200, description: 'Bid history' })
  @ApiValidationErrorResponse()
  async bidHistory(
    @Param('slug') slug: string,
    @Query() query: BidHistoryQueryDto,
  ) {
    const data = await this.bids.getBidHistory(slug, query);
    return { success: true, data };
  }

  @ApiTags('auctions')
  @Post(':slug/bids')
  @ApiOperation({ summary: 'Place bid (live auctions)' })
  @ApiResponse({ status: 200, description: 'Bid accepted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiValidationErrorResponse()
  async placeBid(
    @Param('slug') slug: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: PlaceBidDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    const bid = await this.bids.placeBid(
      slug,
      userId,
      dto.amount,
      ip,
      userAgent ?? '',
    );
    return { success: true, data: { bid } };
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':slug')
  @ApiOperation({ summary: 'Lot detail (optional auth for price breakdown)' })
  @ApiResponse({ status: 200, description: 'Lot detail' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async detail(
    @Param('slug') slug: string,
    @Req() req: { user?: AuthUserPayload },
  ) {
    const data = await this.lots.getLotBySlug(slug, {
      viewerUserId: req.user?.sub,
      viewerUserType: req.user?.userType ?? null,
    });
    return { success: true, data };
  }

  @Post()
  @ApiOperation({ summary: 'Create listing (PENDING_REVIEW)' })
  @ApiResponse({ status: 201, description: 'Listing created' })
  @ApiValidationErrorResponse()
  async create(@CurrentUser('sub') userId: string, @Body() dto: CreateLotDto) {
    const data = await this.lots.createLot(userId, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update listing (owner, draft/pending/rejected)' })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiValidationErrorResponse()
  async update(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLotDto,
  ) {
    const data = await this.lots.updateLot(userId, id, dto);
    return { success: true, data };
  }
}
