import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LotStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

const RSS_KEY = 'feed:rss';
const JSON_KEY = 'feed:json';
const TTL = 300;

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private baseUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL') ?? 'https://hephaistos.eu'
    ).replace(/\/$/, '');
  }

  async getRssXml(): Promise<string> {
    const cached = await this.redis.get(RSS_KEY);
    if (cached) return cached;

    const lots = await this.prisma.lot.findMany({
      where: { status: LotStatus.ACTIVE, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        title: true,
        slug: true,
        description: true,
        createdAt: true,
      },
    });

    const base = this.baseUrl();
    const items = lots
      .map(
        (l) => `
    <item>
      <title>${escapeXml(l.title)}</title>
      <link>${base}/en/lot/${l.slug}</link>
      <description>${escapeXml(l.description.slice(0, 500))}</description>
      <pubDate>${l.createdAt.toUTCString()}</pubDate>
      <guid>${base}/en/lot/${l.slug}</guid>
    </item>`,
      )
      .join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Hephaistos — Latest Lots</title>
    <link>${base}</link>
    <description>Latest industrial equipment auctions</description>
    <language>en</language>
    ${items}
  </channel>
</rss>`;

    await this.redis.set(RSS_KEY, xml, 'EX', TTL);
    return xml;
  }

  async getJsonFeed(): Promise<Record<string, unknown>> {
    const cached = await this.redis.get(JSON_KEY);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;

    const lots = await this.prisma.lot.findMany({
      where: { status: LotStatus.ACTIVE, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        title: true,
        slug: true,
        description: true,
        createdAt: true,
      },
    });

    const base = this.baseUrl();
    const feed = {
      version: 'https://jsonfeed.org/version/1.1',
      title: 'Hephaistos — Latest Lots',
      home_page_url: base,
      feed_url: `${base}/api/v1/feed/json`,
      items: lots.map((l) => ({
        id: `${base}/en/lot/${l.slug}`,
        url: `${base}/en/lot/${l.slug}`,
        title: l.title,
        content_text: l.description,
        date_published: l.createdAt.toISOString(),
      })),
    };

    await this.redis.set(JSON_KEY, JSON.stringify(feed), 'EX', TTL);
    return feed;
  }

  async invalidate(): Promise<void> {
    await this.redis.del(RSS_KEY);
    await this.redis.del(JSON_KEY);
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
