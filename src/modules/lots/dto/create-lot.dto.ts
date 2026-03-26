import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class LotLocationDto {
  @ApiProperty()
  @IsString()
  city!: string;

  @ApiProperty()
  @IsString()
  region!: string;

  @ApiProperty()
  @IsString()
  country!: string;

  @ApiProperty()
  @IsString()
  countryCode!: string;

  @ApiProperty()
  @IsNumber()
  lat!: number;

  @ApiProperty()
  @IsNumber()
  lng!: number;
}

export class CreateLotDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  brand!: string;

  @ApiProperty()
  @IsString()
  model!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  year!: number;

  /** Category slug */
  @ApiProperty()
  @IsString()
  categoryId!: string;

  @ApiProperty({ enum: ['excellent', 'good', 'fair', 'damaged'] })
  @IsIn(['excellent', 'good', 'fair', 'damaged'])
  condition!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  specs!: Record<string, string | number>;

  @ApiProperty({ enum: ['TIMED', 'BUY_NOW'] })
  @IsIn(['TIMED', 'BUY_NOW'])
  auctionType!: 'TIMED' | 'BUY_NOW';

  @ApiProperty({ description: 'Starting price in cents' })
  @Type(() => Number)
  @IsInt()
  @Min(100)
  startingPrice!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reservePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  buyNowPrice?: number;

  @ApiProperty()
  @IsString()
  startDate!: string;

  @ApiProperty()
  @IsString()
  endDate!: string;

  @ApiProperty({ type: LotLocationDto })
  @ValidateNested()
  @Type(() => LotLocationDto)
  location!: LotLocationDto;

  @ApiPropertyOptional({
    description: 'Image URLs or media IDs (URLs for now)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentIds?: string[];
}
