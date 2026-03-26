import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminDashboardService } from './admin-dashboard.service';

@ApiTags('admin')
@Controller('admin/dashboard')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Aggregated dashboard metrics (cached 30s)' })
  @ApiResponse({ status: 200, description: 'Dashboard stats' })
  async stats() {
    const data = await this.dashboard.getStats();
    return { success: true, data };
  }
}
