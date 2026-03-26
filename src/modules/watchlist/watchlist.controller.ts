import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiValidationErrorResponse } from '../../common/swagger/standard-responses';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WatchlistQueryDto } from './dto/watchlist-query.dto';
import { WatchlistService } from './watchlist.service';

@ApiTags('watchlist')
@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly watchlist: WatchlistService) {}

  @Get()
  @ApiOperation({ summary: 'Watchlisted lots (cursor pagination)' })
  @ApiResponse({ status: 200, description: 'Watchlist page' })
  @ApiValidationErrorResponse()
  async list(
    @CurrentUser('sub') userId: string,
    @Query() query: WatchlistQueryDto,
  ) {
    const data = await this.watchlist.list(userId, query);
    return { success: true, data };
  }

  @Get(':lotSlug/check')
  @ApiOperation({ summary: 'Whether lot is on watchlist' })
  async check(
    @CurrentUser('sub') userId: string,
    @Param('lotSlug') lotSlug: string,
  ) {
    const data = await this.watchlist.check(userId, lotSlug);
    return { success: true, data };
  }

  @Post(':lotSlug')
  @ApiOperation({ summary: 'Add lot to watchlist' })
  async add(
    @CurrentUser('sub') userId: string,
    @Param('lotSlug') lotSlug: string,
  ) {
    await this.watchlist.add(userId, lotSlug);
    return { success: true };
  }

  @Delete(':lotSlug')
  @ApiOperation({ summary: 'Remove lot from watchlist' })
  async remove(
    @CurrentUser('sub') userId: string,
    @Param('lotSlug') lotSlug: string,
  ) {
    await this.watchlist.remove(userId, lotSlug);
    return { success: true };
  }
}
