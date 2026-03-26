import {
  Body,
  Controller,
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
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { AdminUsersService } from './admin-users.service';

@ApiTags('admin')
@Controller('admin')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get('users')
  @ApiOperation({ summary: 'List users (cursor pagination)' })
  @ApiValidationErrorResponse()
  async list(@Query() query: AdminUsersQueryDto) {
    return { success: true, data: await this.adminUsers.listUsers(query) };
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'User detail (admin)' })
  async detail(@Param('id') id: string) {
    const user = await this.adminUsers.getUserDetail(id);
    return { success: true, data: { user } };
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Change user role' })
  @ApiValidationErrorResponse()
  async changeRole(
    @CurrentUser('sub') adminId: string,
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
  ) {
    const user = await this.adminUsers.changeRole(adminId, id, dto);
    return { success: true, data: { user } };
  }

  @Patch('users/:id/suspend')
  @ApiOperation({ summary: 'Suspend user' })
  @ApiResponse({ status: 200, description: 'User suspended' })
  async suspend(@CurrentUser('sub') adminId: string, @Param('id') id: string) {
    const user = await this.adminUsers.suspend(adminId, id);
    return { success: true, data: { user } };
  }

  @Patch('users/:id/unsuspend')
  @ApiOperation({ summary: 'Unsuspend user' })
  @ApiResponse({ status: 200, description: 'User unsuspended' })
  async unsuspend(
    @CurrentUser('sub') adminId: string,
    @Param('id') id: string,
  ) {
    const user = await this.adminUsers.unsuspend(adminId, id);
    return { success: true, data: { user } };
  }
}
