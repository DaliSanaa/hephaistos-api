import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { ResolveFlagDto } from './dto/resolve-flag.dto';

@Injectable()
export class AdminFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async listFlags() {
    const events = await this.prisma.event.findMany({
      where: { type: 'shill.flagged' },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    const lotIds = [
      ...new Set(
        events.map((e) => e.entityId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const lots = await this.prisma.lot.findMany({
      where: { id: { in: lotIds } },
      select: { id: true, title: true },
    });
    const lotMap = new Map(lots.map((l) => [l.id, l.title]));

    const items = events.map((e) => {
      const payload = e.payload as {
        flags?: string[];
        resolved?: boolean;
      };
      const lotId = e.entityId ?? '';
      const userName = e.user
        ? `${e.user.firstName} ${e.user.lastName}`.trim()
        : '';
      return {
        eventId: e.id,
        type: e.type,
        lotId,
        lotTitle: lotMap.get(lotId) ?? '',
        userId: e.userId ?? '',
        userName,
        flags: payload.flags ?? [],
        createdAt: e.createdAt.toISOString(),
        resolved: Boolean(payload.resolved),
      };
    });

    return { items };
  }

  async resolveFlag(
    eventId: string,
    adminId: string,
    dto: ResolveFlagDto,
  ): Promise<{ success: boolean }> {
    const ev = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!ev || ev.type !== 'shill.flagged') {
      throw new NotFoundException('Flag not found');
    }
    const payload = (ev.payload ?? {}) as Record<string, unknown>;
    if (payload.resolved === true) {
      throw new BadRequestException('Already resolved');
    }

    const targetUserId = ev.userId;
    if (!targetUserId) {
      throw new BadRequestException('Event has no subject user');
    }

    await this.prisma.$transaction(async (db) => {
      const nextPayload = {
        ...payload,
        resolved: true,
        resolvedAt: new Date().toISOString(),
        resolutionAction: dto.action,
        resolutionNote: dto.note,
        resolvedByAdminId: adminId,
      };
      await db.event.update({
        where: { id: eventId },
        data: { payload: nextPayload as Prisma.InputJsonValue },
      });

      if (dto.action === 'warn') {
        await db.user.update({
          where: { id: targetUserId },
          data: { strikeCount: { increment: 1 } },
        });
      }
      if (dto.action === 'suspend') {
        await db.user.update({
          where: { id: targetUserId },
          data: { suspendedAt: new Date() },
        });
      }
    });

    if (dto.action === 'warn') {
      await this.notifications.notify({
        userId: targetUserId,
        title: 'Account warning',
        body:
          dto.note ||
          'A moderator has issued a warning regarding bidding activity.',
        type: 'admin.warning',
        sendEmail: false,
      });
    }

    return { success: true };
  }
}
