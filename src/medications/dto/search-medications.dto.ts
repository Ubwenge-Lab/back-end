// backend/src/medications/dto/search-medications.dto.ts

import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class SearchMedicationsDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  query?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  pharmacyId?: string;

  @ApiProperty({ required: false, description: 'Filter by specific branch' })
  @IsString()
  @IsOptional()
  branchId?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  @Transform(
    ({ value }: { value: string | boolean }) =>
      value === 'true' || value === true,
  )
  requiresPrescription?: boolean;

  @ApiProperty({ required: false, default: 100 })
  @IsNumber()
  @IsOptional()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  limit?: number;
}
