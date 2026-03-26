import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { LotStatus } from '@prisma/client';

export class SellerLotsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: LotStatus })
  @IsOptional()
  @IsIn([
    'DRAFT',
    'PENDING_REVIEW',
    'ACTIVE',
    'ENDED',
    'SOLD',
    'CANCELLED',
    'REJECTED',
  ])
  status?: LotStatus;
}
