import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class KycDocumentDto {
  @ApiProperty({ description: 'e.g. IDENTITY_PROOF' })
  @IsString()
  documentType!: string;

  @ApiProperty({
    type: [String],
    description: 'Base64-encoded document page images',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  pagesBase64!: string[];
}
