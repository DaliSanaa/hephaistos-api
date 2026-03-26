import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDisputeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidence?: string[];
}

export class ResolveDisputeDto {
  @ApiProperty({ enum: ['buyer', 'seller', 'partial'] })
  @IsString()
  resolution!: 'buyer' | 'seller' | 'partial';

  @ApiPropertyOptional()
  @IsOptional()
  refundAmount?: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  note!: string;
}
