import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl } from 'class-validator';

export class ValidateCardDto {
  @ApiProperty({
    example: 'https://app.example.com/dashboard/payment/callback',
  })
  @IsString()
  @IsUrl({ require_tld: false })
  returnUrl!: string;
}
