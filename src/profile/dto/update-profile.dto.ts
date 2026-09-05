import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const SUPPORTED_COUNTRIES = ['RW', 'UG'] as const;
export const SUPPORTED_LOCALES = ['en', 'fr', 'kin', 'sw'] as const; // D9: confirm lg vs sw with CTO

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Tony' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Niyonkuru' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_COUNTRIES, example: 'RW' })
  @IsOptional()
  @IsIn(SUPPORTED_COUNTRIES)
  country?: 'RW' | 'UG';

  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, example: 'en' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: 'en' | 'fr' | 'kin' | 'sw';
}
