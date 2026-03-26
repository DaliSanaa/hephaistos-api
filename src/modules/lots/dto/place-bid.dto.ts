import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class PlaceBidDto {
  @ApiProperty({ description: 'Bid amount in cents' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;
}
