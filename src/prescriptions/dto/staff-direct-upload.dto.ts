// backend/src/prescriptions/dto/staff-direct-upload.dto.ts
// UGANDA: Staff direct prescription upload on behalf of a walk-in patient

import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StaffDirectUploadPrescriptionDto {
  @ApiProperty({ description: 'Uploaded file URL (from POST /upload/prescription)' })
  @IsString()
  fileUrl: string;

  @ApiProperty({ description: 'Original file name' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: 'File MIME type' })
  @IsString()
  fileType: string;

  @ApiPropertyOptional({ description: 'Registered patient ID (required if patient is in system)' })
  @IsString()
  @IsOptional()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Walk-in patient name (used to create a guest patient)' })
  @IsString()
  @IsOptional()
  patientName?: string;

  @ApiPropertyOptional({ description: 'Walk-in patient phone (used to create a guest patient)' })
  @IsString()
  @IsOptional()
  patientPhone?: string;

  @ApiPropertyOptional({ description: 'Notes for the pharmacist (e.g., patient description, complaint)' })
  @IsString()
  @IsOptional()
  notes?: string;
}
