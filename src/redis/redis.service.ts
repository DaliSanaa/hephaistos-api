import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis(this.config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(
    key: string,
    value: string,
    mode?: 'EX',
    duration?: number,
  ): Promise<void> {
    if (mode === 'EX' && duration !== undefined) {
      await this.client.set(key, value, 'EX', duration);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /** SET key value EX ttl NX — returns true if lock acquired. */
  async setNxEx(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const r = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return r === 'OK';
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.client.publish(channel, message);
  }

  /** @returns unsubscribe function */
  async subscribe(
    channel: string,
    handler: (message: string) => void,
  ): Promise<() => Promise<void>> {
    const sub = this.client.duplicate();
    await sub.subscribe(channel);
    sub.on('message', (_ch, msg) => {
      if (_ch === channel) handler(msg);
    });
    return async () => {
      await sub.unsubscribe(channel);
      sub.disconnect();
    };
  }

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get(key);
    if (cached) return JSON.parse(cached) as T;
    const value = await factory();
    await this.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    return value;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
