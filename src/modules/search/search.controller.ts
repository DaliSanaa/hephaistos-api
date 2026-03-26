import {
  Controller,
  Get,
  Header,
  Query,
  Req,
  Res,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import type { AuthUserPayload } from '../../common/types/auth-user';
import { FeedService } from './feed.service';
import { SearchService } from './search.service';
import { SitemapService } from './sitemap.service';
import { SearchQueryDto } from './dto/search-query.dto';
import { ApiValidationErrorResponse } from '../../common/swagger/standard-responses';

@Controller()
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly feed: FeedService,
    private readonly sitemap: SitemapService,
  ) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiTags('search')
  @Get('search')
  @ApiOperation({
    summary: 'Full-text search (Typesense) or Prisma browse fallback',
  })
  @ApiValidationErrorResponse()
  async searchLots(
    @Query() query: SearchQueryDto,
    @Req()
    req: {
      ip?: string;
      user?: AuthUserPayload;
      headers?: { 'user-agent'?: string };
    },
  ) {
    const userId = req.user?.sub;
    return this.searchService.search(query, {
      userId,
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Public()
  @ApiTags('search')
  @Get('search/suggest')
  @ApiOperation({ summary: 'Autocomplete suggestions' })
  async suggest(@Query('q') q: string) {
    return this.searchService.suggest(q ?? '');
  }

  @Public()
  @ApiTags('system')
  @Get('feed/rss')
  @ApiOperation({ summary: 'RSS 2.0 feed of latest lots' })
  async rss(@Res() res: Response) {
    const xml = await this.feed.getRssXml();
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(xml);
  }

  @Public()
  @ApiTags('system')
  @Get('feed/json')
  @ApiOperation({ summary: 'JSON Feed 1.1' })
  async jsonFeed(@Res() res: Response) {
    const feed = await this.feed.getJsonFeed();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(feed);
  }

  @Public()
  @ApiTags('system')
  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @ApiOperation({ summary: 'Sitemap index' })
  sitemapIndex() {
    return this.sitemap.getSitemapIndexXml();
  }

  @Public()
  @ApiTags('system')
  @Get('sitemap-:locale.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @ApiOperation({ summary: 'Per-locale sitemap with hreflang' })
  async sitemapLocale(@Param('locale') locale: string) {
    const xml = await this.sitemap.getLocaleSitemapXml(locale);
    return xml;
  }

  @Public()
  @ApiTags('system')
  @Get('geo/detect')
  @ApiOperation({ summary: 'Geo hints from CDN headers (optional)' })
  detect(
    @Req()
    req: {
      headers: Record<string, string | string[] | undefined>;
    },
  ) {
    const h = req.headers;
    const str = (name: string): string | null => {
      const v = h[name.toLowerCase()] ?? h[name];
      if (Array.isArray(v)) return v[0] ?? null;
      return typeof v === 'string' ? v : null;
    };

    const country = str('cf-ipcountry') ?? str('x-vercel-ip-country') ?? null;
    const city = str('cf-ipcity') ?? str('x-vercel-ip-city') ?? null;
    const lat = str('cf-iplatitude') ?? str('x-vercel-ip-latitude') ?? null;
    const lng = str('cf-iplongitude') ?? str('x-vercel-ip-longitude') ?? null;

    const localeMap: Record<string, string> = {
      DE: 'de',
      AT: 'de',
      CH: 'de',
      FR: 'fr',
      BE: 'fr',
      NL: 'nl',
      PL: 'pl',
      ES: 'es',
    };
    const suggestedLocale =
      country && localeMap[country.toUpperCase()]
        ? localeMap[country.toUpperCase()]
        : 'en';

    return {
      success: true,
      data: {
        country,
        city,
        lat,
        lng,
        suggestedLocale,
      },
    };
  }
}
