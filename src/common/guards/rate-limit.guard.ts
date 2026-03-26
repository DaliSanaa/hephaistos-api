import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RedisService } from '../../redis/redis.service';
import type { AuthUserPayload } from '../types/auth-user';
import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from '../decorators/rate-limit.decorator';

type AuthedRequest = Request & { user?: AuthUserPayload };

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return true;
    }

    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    const pathOnly = req.originalUrl.split('?')[0] ?? '';

    if (
      pathOnly.startsWith('/api/v1/health') ||
      pathOnly.startsWith('/api/docs')
    ) {
      return true;
    }

    const override = this.reflector.getAllAndOverride<
      RateLimitOptions | undefined
    >(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);

    const { max, windowSec, redisKey } = this.resolveLimits(
      req,
      pathOnly,
      override,
    );
    const current = await this.redis.incr(redisKey);
    if (current === 1) {
      await this.redis.expire(redisKey, windowSec);
    }

    if (current > max) {
      throw new HttpException(
        {
          success: false,
          error: { code: 'RATE_LIMIT', message: 'Too many requests' },
        },
        429,
      );
    }

    return true;
  }

  private resolveLimits(
    req: AuthedRequest,
    pathOnly: string,
    override: RateLimitOptions | undefined,
  ): { max: number; windowSec: number; redisKey: string } {
    const method = req.method;
    const ip = req.ip || 'unknown';
    const userId = req.user?.sub;

    if (override) {
      const segment = `${method}:${pathOnly}`;
      const key = userId
        ? `rate:user:${userId}:${segment}`
        : `rate:ip:${ip}:${segment}`;
      return { max: override.max, windowSec: override.window, redisKey: key };
    }

    if (method === 'POST' && pathOnly.includes('/auth/')) {
      return {
        max: 10,
        windowSec: 60,
        redisKey: `rate:ip:${ip}:auth:${pathOnly}`,
      };
    }

    if (method === 'GET' && pathOnly.includes('/search')) {
      return {
        max: 60,
        windowSec: 60,
        redisKey: `rate:ip:${ip}:search:${pathOnly}`,
      };
    }

    if (method === 'POST' && /\/lots\/[^/]+\/bids\/?$/.test(pathOnly)) {
      if (userId) {
        return {
          max: 30,
          windowSec: 60,
          redisKey: `rate:user:${userId}:place-bid`,
        };
      }
      return {
        max: 100,
        windowSec: 60,
        redisKey: `rate:ip:${ip}:bids-anon`,
      };
    }

    if (userId) {
      return {
        max: 200,
        windowSec: 60,
        redisKey: `rate:user:${userId}:${method}:${pathOnly}`,
      };
    }

    return {
      max: 100,
      windowSec: 60,
      redisKey: `rate:ip:${ip}:${method}:${pathOnly}`,
    };
  }
}
