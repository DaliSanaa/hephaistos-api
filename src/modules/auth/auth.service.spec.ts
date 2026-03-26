import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserType } from '@prisma/client';
import { AuthService } from './auth.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { EventService } from '../events/events.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

describe('AuthService', () => {
  let auth: AuthService;
  let prisma: {
    user: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
  };
  let jwt: { sign: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    jwt = { sign: jest.fn().mockReturnValue('jwt-token') };

    const rate = {
      assertRegisterAllowed: jest.fn().mockResolvedValue(undefined),
      recordRegisterAttempt: jest.fn().mockResolvedValue(undefined),
      assertLoginAllowed: jest.fn(),
      recordLoginFailure: jest.fn(),
      clearLoginFailures: jest.fn(),
      assertForgotAllowed: jest.fn(),
      recordForgotAttempt: jest.fn(),
    };

    auth = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      {
        get: jest.fn((k: string) =>
          k === 'NODE_ENV' ? 'test' : k === 'COOKIE_DOMAIN' ? 'localhost' : '',
        ),
      } as unknown as ConfigService,
      { log: jest.fn() } as unknown as EventService,
      rate as unknown as AuthRateLimitService,
      {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
      } as unknown as RedisService,
    );
  });

  it('signToken embeds user claims', () => {
    const t = auth.signToken({
      id: 'u1',
      email: 'a@b.c',
      role: UserRole.BUYER,
      userType: UserType.PRIVATE,
    });
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'u1',
        email: 'a@b.c',
        role: UserRole.BUYER,
        userType: UserType.PRIVATE,
      }),
    );
    expect(t).toBe('jwt-token');
  });

  it('register rejects when terms not accepted', async () => {
    await expect(
      auth.register(
        {
          acceptTerms: false,
          email: 'x@y.z',
          password: 'Abcd1234!',
          firstName: 'A',
          lastName: 'B',
          userType: 'PRIVATE',
          countryCode: 'DE',
        } as never,
        '1.1.1.1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('register rejects duplicate email', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(
      auth.register(
        {
          acceptTerms: true,
          email: 'dup@test.com',
          password: 'Abcd1234!',
          firstName: 'A',
          lastName: 'B',
          userType: 'PRIVATE',
          countryCode: 'DE',
        } as never,
        '1.1.1.1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
