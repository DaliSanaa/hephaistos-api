import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LotStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

const LOCALES = ['en', 'de', 'fr', 'nl', 'pl', 'es'];
const TTL = 3600;

const STATIC_PAGES: { path: string; priority: string; changefreq: string }[] = [
  { path: '', priority: '1.0', changefreq: 'daily' },
  { path: '/browse', priority: '0.9', changefreq: 'hourly' },
  { path: '/about', priority: '0.5', changefreq: 'monthly' },
  { path: '/how-it-works', priority: '0.6', changefreq: 'monthly' },
  { path: '/faq', priority: '0.5', changefreq: 'monthly' },
  { path: '/contact', priority: '0.4', changefreq: 'monthly' },
  { path: '/sell', priority: '0.7', changefreq: 'monthly' },
  {
    path: '/guides/buying-used-tractors',
    priority: '0.6',
    changefreq: 'monthly',
  },
  { path: '/guides/selling-equipment', priority: '0.6', changefreq: 'monthly' },
  { path: '/guides/auction-tips', priority: '0.6', changefreq: 'monthly' },
];

@Injectable()
export class SitemapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private baseUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  private sitemapApiBase(): string {
    const explicit = (
      this.config.get<string>('PUBLIC_API_BASE_URL') ?? ''
    ).trim();
    if (explicit) return explicit.replace(/\/$/, '');
    return `${this.baseUrl()}/api/v1`;
  }

  getSitemapIndexXml(): string {
    const apiBase = this.sitemapApiBase();
    const entries = LOCALES.map(
      (locale) => `
    <sitemap>
      <loc>${apiBase}/sitemap-${locale}.xml</loc>
      <lastmod>${new Date().toISOString()}</lastmod>
    </sitemap>`,
    ).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${entries}
</sitemapindex>`;
  }

  async getLocaleSitemapXml(locale: string): Promise<string> {
    const loc = locale.replace(/[^a-z]/gi, '').toLowerCase();
    if (!LOCALES.includes(loc)) {
      return '';
    }

    const cacheKey = `sitemap:${loc}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const base = this.baseUrl();
    const lots = await this.prisma.lot.findMany({
      where: { status: LotStatus.ACTIVE, deletedAt: null },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    const alternates = (path: string) =>
      LOCALES.map(
        (l) =>
          `      <xhtml:link rel="alternate" hreflang="${l}" href="${base}/${l}${path}" />`,
      ).join('\n');

    const staticUrls = STATIC_PAGES.map((page) => {
      const path = page.path;
      return `
    <url>
      <loc>${base}/${loc}${path}</loc>
      <changefreq>${page.changefreq}</changefreq>
      <priority>${page.priority}</priority>
${alternates(path)}
    </url>`;
    }).join('');

    const lotUrls = lots
      .map((lot) => {
        const path = `/lot/${lot.slug}`;
        return `
    <url>
      <loc>${base}/${loc}${path}</loc>
      <lastmod>${lot.updatedAt.toISOString()}</lastmod>
      <changefreq>daily</changefreq>
      <priority>0.8</priority>
${alternates(path)}
    </url>`;
      })
      .join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  ${staticUrls}
  ${lotUrls}
</urlset>`;

    await this.redis.set(cacheKey, xml, 'EX', TTL);
    return xml;
  }

  async invalidateAll(): Promise<void> {
    await Promise.all([...LOCALES.map((l) => this.redis.del(`sitemap:${l}`))]);
  }
}
