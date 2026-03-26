import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class AuthRateLimitService {
  constructor(private readonly redis: RedisService) {}

  private client() {
    return this.redis.getClient();
  }

  async assertLoginAllowed(email: string): Promise<void> {
    const key = `login:fail:${email.toLowerCase()}`;
    const raw = await this.client().get(key);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    if (n >= 5) {
      throw new HttpException(
        {
          message: 'Too many failed login attempts. Try again later.',
          retryAfterSec: 900,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordLoginFailure(email: string): Promise<void> {
    const key = `login:fail:${email.toLowerCase()}`;
    const n = await this.client().incr(key);
    if (n === 1) await this.client().expire(key, 900);
  }

  async clearLoginFailures(email: string): Promise<void> {
    await this.client().del(`login:fail:${email.toLowerCase()}`);
  }

  async assertRegisterAllowed(ip: string): Promise<void> {
    const key = `rate:register:${ip}`;
    const raw = await this.client().get(key);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    if (n >= 3) {
      throw new HttpException(
        {
          message: 'Too many registration attempts from this IP.',
          retryAfterSec: 3600,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordRegisterAttempt(ip: string): Promise<void> {
    const key = `rate:register:${ip}`;
    const n = await this.client().incr(key);
    if (n === 1) await this.client().expire(key, 3600);
  }

  async assertForgotAllowed(email: string): Promise<void> {
    const key = `rate:forgot:${email.toLowerCase()}`;
    const raw = await this.client().get(key);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    if (n >= 3) {
      throw new HttpException(
        {
          message: 'Too many password reset requests for this email.',
          retryAfterSec: 3600,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordForgotAttempt(email: string): Promise<void> {
    const key = `rate:forgot:${email.toLowerCase()}`;
    const n = await this.client().incr(key);
    if (n === 1) await this.client().expire(key, 3600);
  }
}
