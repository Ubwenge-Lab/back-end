// backend/src/lab-results/dto/structured-result-entry.dto.ts

import { IsArray, ValidateNested, IsString, IsNotEmpty, IsOptional, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StructuredResultParameterDto {
  @ApiProperty({ example: 'Hemoglobin' })
  @IsString()
  @IsNotEmpty()
  parameter: string;

  @ApiProperty({ example: '13.5' })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiPropertyOptional({ example: 'g/dL' })
  @IsString()
  @IsOptional()
  unit?: string;
}

export class StructuredResultEntryDto {
  @ApiProperty({ type: [StructuredResultParameterDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StructuredResultParameterDto)
  results: StructuredResultParameterDto[];
}
