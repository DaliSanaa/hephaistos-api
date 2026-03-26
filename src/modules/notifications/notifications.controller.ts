import { Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Notifications (cursor) + unread count' })
  @ApiResponse({ status: 200, description: 'Notifications page' })
  async list(
    @CurrentUser('sub') userId: string,
    @Query() query: NotificationQueryDto,
  ) {
    const data = await this.notifications.listForUser(userId, {
      limit: query.limit,
      cursor: query.cursor,
    });
    return { success: true, data };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications read' })
  async readAll(@CurrentUser('sub') userId: string) {
    await this.notifications.markAllRead(userId);
    return { success: true };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  async readOne(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    await this.notifications.markRead(userId, id);
    return { success: true };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete notification' })
  async remove(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    await this.notifications.deleteNotification(userId, id);
    return { success: true };
  }
}
