import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';

export class ResolveFlagDto {
  @ApiProperty({ enum: ['dismiss', 'warn', 'suspend'] })
  @IsIn(['dismiss', 'warn', 'suspend'])
  action!: 'dismiss' | 'warn' | 'suspend';

  @ApiProperty()
  @IsString()
  @MinLength(1)
  note!: string;
}
