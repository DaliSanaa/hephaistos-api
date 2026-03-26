import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PASSWORD_RULES_MESSAGE } from '../../../common/utils/password-rules';

const CC = /^[A-Za-z]{2}$/;

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d).{8,}$/, { message: PASSWORD_RULES_MESSAGE })
  password!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  firstName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  lastName!: string;

  @ApiProperty({ enum: ['BUSINESS', 'PRIVATE', 'business', 'private'] })
  @IsIn(['BUSINESS', 'PRIVATE', 'business', 'private'])
  userType!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 2)
  @Matches(CC)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  countryCode!: string;

  @ApiPropertyOptional()
  @ValidateIf(
    (o: RegisterDto) => String(o.userType).toUpperCase() === 'BUSINESS',
  )
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  companyName?: string;

  @ApiPropertyOptional()
  @ValidateIf(
    (o: RegisterDto) => String(o.userType).toUpperCase() === 'BUSINESS',
  )
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  vatNumber?: string;

  @ApiProperty()
  @IsBoolean()
  acceptTerms!: boolean;
}
