import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminAuctionsService } from './admin-auctions.service';

@ApiTags('admin')
@Controller('admin/auctions')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminAuctionsController {
  constructor(private readonly auctions: AdminAuctionsService) {}

  @Get('live')
  @ApiOperation({ summary: 'Live auctions with watchers and socket room size' })
  @ApiResponse({ status: 200, description: 'Live lots' })
  async live() {
    const data = await this.auctions.getLiveAuctions();
    return { success: true, data };
  }
}
