// backend/src/lab-results/dto/upload-lab-result.dto.ts

import { IsString, IsOptional, IsIn, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiagnosticType } from '@prisma/client';

const LAB_TEST_TYPES = [DiagnosticType.BLOOD, DiagnosticType.URINE];

export class UploadLabResultDto {
  @ApiProperty({ description: "Patient's Medical Record Number (MRN)" })
  @IsString()
  @IsNotEmpty()
  mrn: string;

  @ApiProperty({ description: 'Appointment ID the lab order is linked to' })
  @IsString()
  @IsNotEmpty()
  appointmentId: string;

  @ApiPropertyOptional({
    enum: LAB_TEST_TYPES,
    description: 'Restrict lookup to a specific test type (BLOOD or URINE only)',
  })
  @IsIn(LAB_TEST_TYPES)
  @IsOptional()
  testType?: DiagnosticType;

  @ApiPropertyOptional({
    description:
      'Required when re-uploading/correcting an already-completed result — explains why the original is being amended',
  })
  @IsString()
  @IsOptional()
  correctionReason?: string;
}
