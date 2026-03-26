import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiValidationErrorResponse } from '../../common/swagger/standard-responses';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminLotsQueryDto } from '../lots/dto/admin-lots-query.dto';
import { RejectLotDto } from '../lots/dto/reject-lot.dto';
import { LotsService } from '../lots/lots.service';

@ApiTags('admin')
@Controller('admin/lots')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLotsController {
  constructor(private readonly lots: LotsService) {}

  @Get('review-queue')
  @ApiOperation({ summary: 'Pending review (oldest first)' })
  @ApiResponse({ status: 200, description: 'Queue' })
  async reviewQueue() {
    const data = await this.lots.reviewQueue();
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'All lots (admin)' })
  @ApiValidationErrorResponse()
  async list(@Query() query: AdminLotsQueryDto) {
    return { success: true, data: await this.lots.listAdminLots(query) };
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve listing' })
  async approve(@CurrentUser('sub') adminId: string, @Param('id') id: string) {
    const data = await this.lots.approveLot(adminId, id);
    return { success: true, data };
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject listing' })
  @ApiValidationErrorResponse()
  async reject(
    @CurrentUser('sub') adminId: string,
    @Param('id') id: string,
    @Body() dto: RejectLotDto,
  ) {
    return this.lots.rejectLot(adminId, id, dto.reason);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete lot' })
  async remove(@CurrentUser('sub') adminId: string, @Param('id') id: string) {
    return this.lots.softDeleteLot(adminId, id);
  }
}
