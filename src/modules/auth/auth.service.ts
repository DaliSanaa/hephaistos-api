import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { CookieOptions } from 'express';
import * as crypto from 'node:crypto';
import type { User } from '@prisma/client';
import { KycStatus, UserRole, UserType } from '@prisma/client';
import {
  isStrongPassword,
  PASSWORD_RULES_MESSAGE,
} from '../../common/utils/password-rules';
import {
  toPublicUser,
  type PublicUser,
} from '../../common/utils/user-serializer';
import { EventService } from '../events/events.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import type { RegisterDto } from './dto/register.dto';
import { AuthRateLimitService } from './auth-rate-limit.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly events: EventService,
    private readonly rate: AuthRateLimitService,
    private readonly redis: RedisService,
  ) {}

  getCookieOptions(): CookieOptions {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const cookieDomain = this.config.get<string>('COOKIE_DOMAIN') ?? '';
    const opts: CookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
    if (cookieDomain && cookieDomain !== 'localhost') {
      opts.domain = cookieDomain;
    }
    return opts;
  }

  clearCookieOptions(): CookieOptions {
    return {
      ...this.getCookieOptions(),
      maxAge: 0,
    };
  }

  signToken(user: Pick<User, 'id' | 'email' | 'role' | 'userType'>): string {
    return this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      userType: user.userType,
    });
  }

  async register(
    dto: RegisterDto,
    ip: string,
  ): Promise<{ user: PublicUser; token: string }> {
    if (!dto.acceptTerms) {
      throw new BadRequestException('Terms must be accepted');
    }

    await this.rate.assertRegisterAllowed(ip);
    await this.rate.recordRegisterAttempt(ip);

    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const ut = String(dto.userType).toUpperCase() as UserType;
    if (ut !== UserType.BUSINESS && ut !== UserType.PRIVATE) {
      throw new BadRequestException('Invalid userType');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        userType: ut,
        role: UserRole.BUYER,
        countryCode: dto.countryCode,
        companyName: ut === UserType.BUSINESS ? dto.companyName! : null,
        vatNumber: ut === UserType.BUSINESS ? dto.vatNumber! : null,
        kycStatus: KycStatus.NOT_STARTED,
      },
    });

    void this.events.log({
      type: 'user.registered',
      userId: user.id,
      payload: {
        email: user.email,
        userType: user.userType,
        countryCode: user.countryCode,
      },
    });

    const token = this.signToken(user);
    return { user: toPublicUser(user), token };
  }

  async login(
    dto: { email: string; password: string },
    ip: string,
  ): Promise<{ user: PublicUser; token: string }> {
    const email = dto.email.toLowerCase().trim();
    await this.rate.assertLoginAllowed(email);

    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (!user) {
      await this.rate.recordLoginFailure(email);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.suspendedAt) {
      throw new ForbiddenException('Account suspended');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      await this.rate.recordLoginFailure(email);
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.rate.clearLoginFailures(email);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginIp: ip },
    });

    void this.events.log({
      type: 'user.login',
      userId: user.id,
      payload: { ip },
    });

    const token = this.signToken(user);
    return { user: toPublicUser(user), token };
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');
    return toPublicUser(user);
  }

  async forgotPassword(email: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    await this.rate.assertForgotAllowed(normalized);
    await this.rate.recordForgotAttempt(normalized);

    const user = await this.prisma.user.findFirst({
      where: { email: normalized, deletedAt: null },
    });

    if (!user) return;

    const token = crypto.randomBytes(32).toString('hex');
    const key = `password-reset:${token}`;
    await this.redis.set(key, user.id, 'EX', 3600);

    const link = `${this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'}/auth/reset-password?token=${token}`;
    console.log(`[forgot-password] reset link for ${user.email}: ${link}`);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (!isStrongPassword(newPassword)) {
      throw new BadRequestException(PASSWORD_RULES_MESSAGE);
    }

    const key = `password-reset:${token}`;
    const userId = await this.redis.get(key);
    if (!userId) {
      throw new BadRequestException('Invalid or expired token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await this.redis.del(key);

    void this.events.log({
      type: 'user.password_reset',
      userId,
      payload: {},
    });
  }
}
