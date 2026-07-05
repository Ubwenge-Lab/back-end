// backend/src/diagnostics/dto/update-diagnostic-order-findings.dto.ts

import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DiagnosticStatus } from '@prisma/client';

export class UpdateDiagnosticOrderFindingsDto {
  @ApiPropertyOptional({ enum: DiagnosticStatus, description: 'Updated status of the test' })
  @IsEnum(DiagnosticStatus)
  @IsOptional()
  status?: DiagnosticStatus;

  @ApiPropertyOptional({ description: 'Textual analysis findings and notes' })
  @IsString()
  @IsOptional()
  findings?: string;

  @ApiPropertyOptional({ description: 'Numerical value or key text result summary' })
  @IsString()
  @IsOptional()
  resultValue?: string;

  @ApiPropertyOptional({ description: 'Secure URL of uploaded PDF, DICOM, or image' })
  @IsString()
  @IsOptional()
  fileUrl?: string;

  @ApiPropertyOptional({ description: 'Name of the uploaded file' })
  @IsString()
  @IsOptional()
  fileName?: string;

  @ApiPropertyOptional({ description: 'MIME type of the uploaded file' })
  @IsString()
  @IsOptional()
  fileType?: string;
}
