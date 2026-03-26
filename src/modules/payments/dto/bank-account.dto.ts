import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString, MinLength } from 'class-validator';

export class RegisterBankAccountDto {
  @ApiProperty()
  @IsString()
  @MinLength(15)
  iban!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  bic!: string;

  @ApiProperty()
  @IsString()
  ownerName!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { line1: '1 Rue Example', city: 'Paris', postalCode: '75001' },
  })
  @IsObject()
  ownerAddress!: Record<string, unknown>;
}
