import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class NotificationPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  outbid?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  endingSoon?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  newLotsInCategories?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  wonAuction?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  paymentConfirmation?: boolean;
}
