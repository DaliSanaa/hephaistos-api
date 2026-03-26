import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Prisma } from '@prisma/client';
import { UserType } from '@prisma/client';
import {
  toPublicUser,
  type PublicUser,
} from '../../common/utils/user-serializer';
import { EventService } from '../events/events.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { NotificationPreferencesDto } from './dto/notification-preferences.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventService,
  ) {}

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    const data: Prisma.UserUpdateInput = {};
    const changed: string[] = [];
    if (dto.firstName !== undefined) {
      data.firstName = dto.firstName;
      changed.push('firstName');
    }
    if (dto.lastName !== undefined) {
      data.lastName = dto.lastName;
      changed.push('lastName');
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone;
      changed.push('phone');
    }
    if (dto.countryCode !== undefined) {
      data.countryCode = dto.countryCode;
      changed.push('countryCode');
    }
    if (user.userType === UserType.BUSINESS) {
      if (dto.companyName !== undefined) {
        data.companyName = dto.companyName;
        changed.push('companyName');
      }
      if (dto.vatNumber !== undefined) {
        data.vatNumber = dto.vatNumber;
        changed.push('vatNumber');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    void this.events.log({
      type: 'user.profile_updated',
      userId,
      payload: { changedFields: changed },
    });

    return toPublicUser(updated);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    void this.events.log({
      type: 'user.password_changed',
      userId,
      payload: {},
    });
  }

  async getNotificationPreferences(userId: string) {
    let prefs = await this.prisma.notificationPreferences.findUnique({
      where: { userId },
    });
    if (!prefs) {
      prefs = await this.prisma.notificationPreferences.create({
        data: { userId },
      });
    }
    return prefs;
  }

  async updateNotificationPreferences(
    userId: string,
    dto: NotificationPreferencesDto,
  ) {
    const prefs = await this.getNotificationPreferences(userId);
    return this.prisma.notificationPreferences.update({
      where: { id: prefs.id },
      data: {
        ...(dto.outbid !== undefined && { outbid: dto.outbid }),
        ...(dto.endingSoon !== undefined && { endingSoon: dto.endingSoon }),
        ...(dto.newLotsInCategories !== undefined && {
          newLotsInCategories: dto.newLotsInCategories,
        }),
        ...(dto.wonAuction !== undefined && { wonAuction: dto.wonAuction }),
        ...(dto.paymentConfirmation !== undefined && {
          paymentConfirmation: dto.paymentConfirmation,
        }),
      },
    });
  }
}
