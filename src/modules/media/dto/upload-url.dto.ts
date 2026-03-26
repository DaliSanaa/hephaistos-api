import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';

export class MediaUploadUrlDto {
  @ApiProperty({ example: 'tractor-front.jpg' })
  @IsString()
  @MinLength(1)
  fileName!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @MinLength(3)
  fileType!: string;

  @ApiProperty({ enum: ['lot-image', 'lot-document', 'kyc-document'] })
  @IsString()
  @IsIn(['lot-image', 'lot-document', 'kyc-document'])
  context!: 'lot-image' | 'lot-document' | 'kyc-document';
}
