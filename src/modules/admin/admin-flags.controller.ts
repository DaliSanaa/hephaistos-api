import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiValidationErrorResponse } from '../../common/swagger/standard-responses';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminFlagsService } from './admin-flags.service';
import { ResolveFlagDto } from './dto/resolve-flag.dto';

@ApiTags('admin')
@Controller('admin/flags')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminFlagsController {
  constructor(private readonly flags: AdminFlagsService) {}

  @Get()
  @ApiOperation({ summary: 'Shill bidding flags from event log' })
  @ApiResponse({ status: 200, description: 'Flag rows' })
  async list() {
    const data = await this.flags.listFlags();
    return { success: true, data };
  }

  @Patch(':eventId/resolve')
  @ApiOperation({ summary: 'Resolve a flag (dismiss / warn / suspend)' })
  @ApiValidationErrorResponse()
  async resolve(
    @CurrentUser('sub') adminId: string,
    @Param('eventId') eventId: string,
    @Body() dto: ResolveFlagDto,
  ) {
    return this.flags.resolveFlag(eventId, adminId, dto);
  }
}
