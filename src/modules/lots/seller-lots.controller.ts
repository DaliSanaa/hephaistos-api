import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SellerLotsQueryDto } from './dto/seller-lots-query.dto';
import { LotsService } from './lots.service';

@ApiTags('seller')
@Controller('seller/lots')
export class SellerLotsController {
  constructor(private readonly lots: LotsService) {}

  @Get()
  @ApiOperation({ summary: 'Seller listings (cursor)' })
  @ApiResponse({ status: 200, description: 'Seller lots' })
  async list(
    @CurrentUser('sub') userId: string,
    @Query() query: SellerLotsQueryDto,
  ) {
    const data = await this.lots.listSellerLots(userId, query);
    return { success: true, data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Seller lot detail with stats' })
  @ApiResponse({ status: 200, description: 'Lot detail' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async detail(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    const data = await this.lots.getSellerLotDetail(userId, id);
    return { success: true, data };
  }
}
