// src/reports/dto/export-query.dto.ts

import { IsOptional, IsDateString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ExportQueryDto {
  @ApiPropertyOptional({
    description: 'Start date filter (ISO 8601)',
    example: '2025-01-01',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'End date filter (ISO 8601)',
    example: '2025-12-31',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description:
      'Hospital ID — required for SUPER_ADMIN, auto-resolved for HOSPITAL_ADMIN',
    example: 'b3e1c2d4-...',
  })
  @IsOptional()
  @IsUUID()
  hospitalId?: string;
}
