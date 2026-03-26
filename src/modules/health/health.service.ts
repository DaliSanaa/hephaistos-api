import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

export type HealthServices = {
  database: 'ok' | 'error';
  redis: 'ok' | 'error';
  typesense: 'ok' | 'error' | 'disabled';
};

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  getVersion(): string {
    return this.config.get<string>('APP_VERSION') ?? '0.0.1';
  }

  getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  async checkDatabase(): Promise<'ok' | 'error'> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return 'ok';
    } catch {
      return 'error';
    }
  }

  async checkRedis(): Promise<'ok' | 'error'> {
    try {
      const r = await this.redis.getClient().ping();
      return r === 'PONG' ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }

  async checkTypesense(): Promise<'ok' | 'error' | 'disabled'> {
    if (!this.config.get<boolean>('ENABLE_TYPESENSE')) {
      return 'disabled';
    }
    const host = this.config.get<string>('TYPESENSE_HOST') ?? 'localhost';
    const port = this.config.get<number>('TYPESENSE_PORT') ?? 8108;
    const protocol =
      host === 'localhost' || host === '127.0.0.1' ? 'http' : 'https';
    try {
      const res = await fetch(`${protocol}://${host}:${port}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }

  async getLiveness(): Promise<{
    status: 'ok' | 'degraded';
    timestamp: string;
    services: HealthServices;
    uptime: number;
    version: string;
  }> {
    const [database, redis, typesense] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkTypesense(),
    ]);

    const services: HealthServices = { database, redis, typesense };
    const degraded =
      database !== 'ok' ||
      redis !== 'ok' ||
      (typesense !== 'ok' && typesense !== 'disabled');

    return {
      status: degraded ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      services,
      uptime: this.getUptimeSeconds(),
      version: this.getVersion(),
    };
  }

  async getReadiness(): Promise<{
    status: 'ok' | 'unavailable';
    services: Pick<HealthServices, 'database' | 'redis'>;
  }> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);
    const ok = database === 'ok' && redis === 'ok';
    return {
      status: ok ? 'ok' : 'unavailable',
      services: { database, redis },
    };
  }
}
