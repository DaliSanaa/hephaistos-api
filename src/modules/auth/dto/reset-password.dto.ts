import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { PASSWORD_RULES_MESSAGE } from '../../../common/utils/password-rules';

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiPropertyOptional({
    description: 'Preferred; same rules as registration',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d).{8,}$/, { message: PASSWORD_RULES_MESSAGE })
  newPassword?: string;

  @ApiPropertyOptional({ description: 'Alias for storefront compatibility' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d).{8,}$/, { message: PASSWORD_RULES_MESSAGE })
  password?: string;
}
