// src/appointments/dto/triage-vitals.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class TriageVitalsDto {
  @ApiProperty({
    example: '120/80',
    description: 'Blood pressure reading (e.g. 120/80)',
  })
  @IsString()
  bloodPressure: string;

  @ApiProperty({ example: 36.6, description: 'Body temperature in °C (30–45)' })
  @IsNumber()
  @Min(30)
  @Max(45)
  temperature: number;

  @ApiProperty({ example: 70.5, description: 'Weight in kg (1–500)' })
  @IsNumber()
  @Min(1)
  @Max(500)
  weight: number;

  @ApiProperty({ example: 72, description: 'Heart rate in bpm (30–250)' })
  @IsInt()
  @Min(30)
  @Max(250)
  heartRate: number;

  @ApiProperty({ example: 98, description: 'Oxygen saturation % (50–100)' })
  @IsInt()
  @Min(50)
  @Max(100)
  oxygenSaturation: number;

  @ApiProperty({ example: 'Patient appears anxious' })
  @IsOptional()
  @IsString()
  notes?: string;
}
