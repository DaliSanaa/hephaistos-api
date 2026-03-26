import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RejectLotDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
