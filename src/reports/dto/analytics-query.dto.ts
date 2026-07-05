// src/reports/dto/analytics-query.dto.ts

import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    description:
      'Hospital ID to scope the report to. Required for SUPER_ADMIN; ignored for HOSPITAL_ADMIN, who is auto-scoped to their own hospital.',
  })
  @IsOptional()
  @IsString()
  hospitalId?: string;
}
