import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PayoutStatus } from '@prisma/client';

export class AdminPayoutsQueryDto {
  @ApiPropertyOptional({ enum: PayoutStatus })
  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;
}
