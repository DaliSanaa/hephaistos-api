import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { EventService } from '../events/events.service';
import { LotsService } from '../lots/lots.service';
import { BrowseLotsDto } from '../lots/dto/browse-lots.dto';
import { TypesenseService } from './typesense.service';
import type { SearchQueryDto } from './dto/search-query.dto';

@Injectable()
export class SearchService {
  constructor(
    private readonly typesense: TypesenseService,
    @Inject(forwardRef(() => LotsService))
    private readonly lots: LotsService,
    private readonly events: EventService,
  ) {}

  private mapSort(sort: string | undefined, hasQuery: boolean): string {
    switch (sort) {
      case 'ending_soon':
        return 'endDate:asc';
      case 'newly_listed':
        return 'createdAt:desc';
      case 'price_asc':
        return 'currentBid:asc';
      case 'price_desc':
        return 'currentBid:desc';
      case 'bid_count':
        return 'bidCount:desc';
      case 'relevance':
        return hasQuery ? '_text_match:desc' : 'createdAt:desc';
      default:
        return hasQuery ? '_text_match:desc' : 'endDate:asc';
    }
  }

  async search(
    params: SearchQueryDto,
    opts: { userId?: string; ip?: string; userAgent?: string },
  ) {
    if (!this.typesense.enabled) {
      const browse: BrowseLotsDto = {
        ...params,
        search: params.q ?? params.search,
        sort:
          params.sort === 'relevance'
            ? 'newly_listed'
            : (params.sort as BrowseLotsDto['sort']),
      };
      const data = await this.lots.browseLots(browse);
      void this.events.log({
        type: 'search.query',
        userId: opts.userId,
        payload: {
          query: params.q,
          filters: {
            category: params.category,
            brand: params.brand,
            vertical: params.vertical,
          },
          resultCount: data.totalCount,
          searchTimeMs: null,
          engine: 'prisma',
        },
        ip: opts.ip,
        userAgent: opts.userAgent,
      });
      return {
        success: true,
        data: {
          ...data,
          facets: [],
          searchTimeMs: null,
          page: 1,
          engine: 'prisma' as const,
        },
      };
    }

    const client = this.typesense.getClient();
    const q = (params.q || '').trim();
    const hasQuery = q.length > 0;

    const filters: string[] = ['auctionStatus:=LIVE'];

    if (params.category) {
      const slugs = params.category
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (slugs.length) filters.push(`categorySlug:=[${slugs.join(',')}]`);
    }
    if (params.vertical) {
      filters.push(`verticalSlug:=${params.vertical}`);
    }
    if (params.brand) {
      const brands = params.brand
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (brands.length) filters.push(`brand:=[${brands.join(',')}]`);
    }
    if (params.country) {
      const codes = params.country
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
      if (codes.length) filters.push(`countryCode:=[${codes.join(',')}]`);
    }
    if (params.yearMin !== undefined) filters.push(`year:>=${params.yearMin}`);
    if (params.yearMax !== undefined) filters.push(`year:<=${params.yearMax}`);
    if (params.minPrice !== undefined)
      filters.push(`currentBid:>=${params.minPrice}`);
    if (params.maxPrice !== undefined)
      filters.push(`currentBid:<=${params.maxPrice}`);

    if (
      params.geoLat != null &&
      params.geoLng != null &&
      params.geoRadius != null
    ) {
      filters.push(
        `location:(${params.geoLat}, ${params.geoLng}, ${params.geoRadius} km)`,
      );
    }

    const searchParams: Record<string, unknown> = {
      q: hasQuery ? q : '*',
      query_by: 'title,brand,model,description',
      per_page: params.limit ?? 20,
      page: params.page ?? 1,
      sort_by: this.mapSort(params.sort, hasQuery),
      filter_by: filters.join(' && '),
    };

    if (params.facets?.trim()) {
      searchParams.facet_by = params.facets
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .join(',');
    }

    const result = (await client
      .collections('lots')
      .documents()
      .search(
        searchParams,
      )) as import('typesense/lib/Typesense/Documents').SearchResponse<
      Record<string, unknown>
    >;

    const items = (result.hits ?? []).map((h) => {
      const d = h.document;
      const imageUrl = typeof d.imageUrl === 'string' ? d.imageUrl : null;
      return {
        id: d.id,
        slug: d.slug,
        title: d.title,
        brand: d.brand,
        model: d.model,
        year: d.year,
        condition: d.condition,
        specs: (() => {
          const raw = d.specs;
          if (raw == null) return {};
          if (typeof raw === 'string') {
            try {
              return JSON.parse(raw) as Record<string, unknown>;
            } catch {
              return {};
            }
          }
          if (typeof raw === 'object') return raw as Record<string, unknown>;
          return {};
        })(),
        startingPrice: d.startingPrice,
        currentBid: d.currentBid,
        bidCount: d.bidCount,
        endDate:
          typeof d.endDate === 'number'
            ? new Date(d.endDate * 1000).toISOString()
            : String(d.endDate),
        auctionStatus: d.auctionStatus,
        reserveMet: true,
        primaryImage: imageUrl,
        location: {
          city: d.city ?? '',
          country: '',
          countryCode: d.countryCode ?? '',
        },
        category: {
          slug: d.categorySlug ?? '',
          labelKey: d.categorySlug ?? '',
        },
      };
    });

    void this.events.log({
      type: 'search.query',
      userId: opts.userId,
      payload: {
        query: params.q,
        filters: {
          category: params.category,
          brand: params.brand,
          vertical: params.vertical,
        },
        resultCount: result.found,
        searchTimeMs: result.search_time_ms,
        engine: 'typesense',
      },
      ip: opts.ip,
      userAgent: opts.userAgent,
    });

    return {
      success: true,
      data: {
        items,
        totalCount: result.found,
        facets: result.facet_counts ?? [],
        searchTimeMs: result.search_time_ms,
        page: result.page,
        engine: 'typesense' as const,
      },
    };
  }

  async suggest(q: string) {
    if (!this.typesense.enabled || !q.trim()) {
      return { success: true, data: { suggestions: [] } };
    }
    const client = this.typesense.getClient();
    const result = (await client.collections('lots').documents().search({
      q: q.trim(),
      query_by: 'title,brand,model',
      query_by_weights: '3,2,1',
      per_page: 5,
      prefix: true,
      filter_by: 'auctionStatus:=LIVE',
    })) as import('typesense/lib/Typesense/Documents').SearchResponse<
      Record<string, unknown>
    >;

    const suggestions = (result.hits ?? []).map((h) => {
      const d = h.document;
      const title = typeof d.title === 'string' ? d.title : '';
      const highlights = h.highlight?.title as { snippet?: string } | undefined;
      const slug = typeof d.slug === 'string' ? d.slug : '';
      return {
        text: title,
        highlight: highlights?.snippet ?? title,
        slug,
      };
    });

    return { success: true, data: { suggestions } };
  }
}
