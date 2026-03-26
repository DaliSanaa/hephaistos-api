import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EventService {
  constructor(private readonly prisma: PrismaService) {}

  log(params: {
    type: string;
    userId?: string;
    entityId?: string;
    entityType?: string;
    payload: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
  }): void {
    this.prisma.event
      .create({
        data: {
          type: params.type,
          userId: params.userId,
          entityId: params.entityId,
          entityType: params.entityType,
          payload: params.payload,
          ip: params.ip,
          userAgent: params.userAgent,
        },
      })
      .catch((err: Error) => {
        console.error('[EventService] Failed to log event:', err.message);
      });
  }
}
