import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';
import { PASSWORD_RULES_MESSAGE } from '../../../common/utils/password-rules';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d).{8,}$/, { message: PASSWORD_RULES_MESSAGE })
  newPassword!: string;
}
