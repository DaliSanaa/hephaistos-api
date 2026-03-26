import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiValidationErrorResponse } from '../../common/swagger/standard-responses';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminEventsService } from './admin-events.service';
import { AdminEventsQueryDto } from './dto/admin-events-query.dto';

@ApiTags('admin')
@Controller('admin/events')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminEventsController {
  constructor(private readonly events: AdminEventsService) {}

  @Get()
  @ApiOperation({ summary: 'Cursor-paginated event log (ML / monitoring)' })
  @ApiResponse({ status: 200, description: 'Events page' })
  @ApiValidationErrorResponse()
  async list(@Query() query: AdminEventsQueryDto) {
    const data = await this.events.listEvents(query);
    return { success: true, data };
  }
}
