import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { decodeCursor, encodeCursor } from '../../common/utils/cursor';
import {
  toPublicUser,
  type PublicUser,
} from '../../common/utils/user-serializer';
import { EventService } from '../events/events.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import type { ChangeRoleDto } from './dto/change-role.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
  ) {}

  async listUsers(query: AdminUsersQueryDto) {
    const limit = query.limit ?? 20;
    const take = limit + 1;

    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (query.role) where.role = query.role;
    if (query.userType) where.userType = query.userType;
    if (query.kycStatus) where.kycStatus = query.kycStatus;
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { email: { contains: s, mode: 'insensitive' } },
        { firstName: { contains: s, mode: 'insensitive' } },
        { lastName: { contains: s, mode: 'insensitive' } },
      ];
    }

    const cursorId = query.cursor ? decodeCursor(query.cursor).id : undefined;

    const items = await this.prisma.user.findMany({
      where,
      take,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    let nextCursor: string | null = null;
    if (items.length > limit) {
      const last = items[limit - 1];
      nextCursor = encodeCursor(last.id, last.createdAt.getTime());
      items.pop();
    }

    return {
      items: items.map((u) => toPublicUser(u)),
      nextCursor,
      totalCount: await this.prisma.user.count({ where }),
    };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Admin detail response — never includes password hash. */
  async getUserDetail(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      omit: { passwordHash: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async changeRole(
    adminId: string,
    targetId: string,
    dto: ChangeRoleDto,
  ): Promise<PublicUser> {
    const target = await this.getUser(targetId);
    if (target.id === adminId && dto.role !== UserRole.ADMIN) {
      throw new BadRequestException('Cannot remove your own admin role');
    }
    const from = target.role;
    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { role: dto.role },
    });
    void this.events.log({
      type: 'admin.user_role_changed',
      userId: adminId,
      entityId: targetId,
      entityType: 'user',
      payload: { from, to: dto.role },
    });
    return toPublicUser(updated);
  }

  async suspend(adminId: string, targetId: string): Promise<PublicUser> {
    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { suspendedAt: new Date() },
    });
    void this.events.log({
      type: 'admin.user_suspended',
      userId: adminId,
      entityId: targetId,
      entityType: 'user',
      payload: {},
    });
    return toPublicUser(updated);
  }

  async unsuspend(adminId: string, targetId: string): Promise<PublicUser> {
    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { suspendedAt: null },
    });
    void this.events.log({
      type: 'admin.user_unsuspended',
      userId: adminId,
      entityId: targetId,
      entityType: 'user',
      payload: {},
    });
    return toPublicUser(updated);
  }
}
