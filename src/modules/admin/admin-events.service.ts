import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminEventsQueryDto } from './dto/admin-events-query.dto';

@Injectable()
export class AdminEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async listEvents(dto: AdminEventsQueryDto) {
    const limit = Math.min(dto.limit ?? 50, 100);
    const where: Prisma.EventWhereInput = {};
    if (dto.type) where.type = dto.type;
    if (dto.userId) where.userId = dto.userId;
    if (dto.entityId) where.entityId = dto.entityId;
    if (dto.dateFrom || dto.dateTo) {
      where.createdAt = {};
      if (dto.dateFrom) {
        where.createdAt.gte = new Date(dto.dateFrom);
      }
      if (dto.dateTo) {
        where.createdAt.lte = new Date(dto.dateTo);
      }
    }

    const rows = await this.prisma.event.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      const last = rows.pop()!;
      nextCursor = last.id;
    }

    const items = rows.map((e) => ({
      id: e.id,
      type: e.type,
      userId: e.userId,
      entityId: e.entityId,
      entityType: e.entityType,
      payload: e.payload,
      ip: e.ip,
      userAgent: e.userAgent,
      createdAt: e.createdAt.toISOString(),
    }));

    return { items, nextCursor };
  }
}
