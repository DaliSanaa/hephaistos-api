import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { BrowseLotsDto } from '../../lots/dto/browse-lots.dto';

/** Search/browse query — extends lot browse with Typesense extras (`q`, facets, geo, `page`). */
export class SearchQueryDto extends OmitType(BrowseLotsDto, ['sort'] as const) {
  @ApiPropertyOptional({ description: 'Full-text query (Typesense)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated facet fields to return (Typesense)',
  })
  @IsOptional()
  @IsString()
  facets?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  geoLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  geoLng?: number;

  @ApiPropertyOptional({ description: 'Radius in km' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20000)
  geoRadius?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([
    'ending_soon',
    'newly_listed',
    'price_asc',
    'price_desc',
    'bid_count',
    'relevance',
  ])
  sort?:
    | 'ending_soon'
    | 'newly_listed'
    | 'price_asc'
    | 'price_desc'
    | 'bid_count'
    | 'relevance';
}
