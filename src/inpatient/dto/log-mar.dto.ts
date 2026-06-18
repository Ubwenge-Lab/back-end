import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class LogMarDto {
  @ApiProperty({ example: 'Amoxicillin 500mg' })
  @IsString()
  @IsNotEmpty()
  medicationName: string;

  @ApiProperty({ example: '1 capsule (500mg)' })
  @IsString()
  @IsNotEmpty()
  dose: string;

  @ApiPropertyOptional({
    description: 'Administration route',
    example: 'Oral',
    enum: ['Oral', 'IV', 'IM', 'SC', 'Topical', 'Sublingual', 'Rectal'],
  })
  @IsString()
  @IsOptional()
  route?: string;

  @ApiProperty({
    description: 'ISO 8601 datetime when medication was administered',
    example: '2026-06-18T08:30:00.000Z',
  })
  @IsDateString()
  administeredAt: string;

  @ApiPropertyOptional({
    description: 'ISO 8601 datetime the dose was originally scheduled',
    example: '2026-06-18T08:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @ApiPropertyOptional({
    description: 'Link to a PrescriptionMedication record (optional)',
    example: 'prescription-med-uuid',
  })
  @IsString()
  @IsOptional()
  prescriptionMedId?: string;

  @ApiPropertyOptional({ example: 'Patient tolerated dose well' })
  @IsString()
  @IsOptional()
  notes?: string;
}
