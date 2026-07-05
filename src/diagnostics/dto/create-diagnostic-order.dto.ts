// backend/src/diagnostics/dto/create-diagnostic-order.dto.ts

import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiagnosticType } from '@prisma/client';

export class CreateDiagnosticOrderDto {
  @ApiProperty({ description: 'ID of the patient' })
  @IsString()
  patientId: string;

  @ApiPropertyOptional({ description: 'Optional ID of the clinical appointment' })
  @IsString()
  @IsOptional()
  appointmentId?: string;

  @ApiProperty({ enum: DiagnosticType, description: 'Type of diagnostic test (BLOOD, URINE, XRAY, MRI)' })
  @IsEnum(DiagnosticType)
  testType: DiagnosticType;

  @ApiProperty({ description: 'Linked ICD-10 diagnostic code' })
  @IsString()
  icd10Code: string;
}
