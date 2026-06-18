import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class VitalReadingDto {
  @ApiProperty({
    description: 'Name of the vital sign being recorded',
    example: 'Blood Pressure',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Measured value (free text)',
    example: '120/80',
  })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiPropertyOptional({
    description: 'Unit of measurement',
    example: 'mmHg',
  })
  @IsString()
  @IsOptional()
  unit?: string;
}

export class VitalsChecklistDto {
  @ApiProperty({ description: 'Temperature was measured and recorded' })
  @IsBoolean()
  temperatureChecked: boolean;

  @ApiProperty({ description: 'Blood pressure was measured and recorded' })
  @IsBoolean()
  bloodPressureChecked: boolean;

  @ApiProperty({ description: 'Heart rate was measured and recorded' })
  @IsBoolean()
  heartRateChecked: boolean;

  @ApiProperty({ description: 'Oxygen saturation (SpO2) was measured and recorded' })
  @IsBoolean()
  oxygenSaturationChecked: boolean;

  @ApiProperty({ description: 'Respiratory rate was measured and recorded' })
  @IsBoolean()
  respiratoryRateChecked: boolean;

  @ApiPropertyOptional({ description: 'Weight was measured and recorded' })
  @IsBoolean()
  @IsOptional()
  weightChecked?: boolean;
}

export class LogVitalsDto {
  @ApiProperty({
    description: 'Free-form list of vital readings for this ward round',
    type: [VitalReadingDto],
    example: [
      { name: 'Temperature', value: '37.2', unit: '°C' },
      { name: 'Blood Pressure', value: '120/80', unit: 'mmHg' },
      { name: 'Heart Rate', value: '72', unit: 'bpm' },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VitalReadingDto)
  readings: VitalReadingDto[];

  @ApiProperty({
    description: 'Checklist confirming which standard vital checks were completed',
    type: VitalsChecklistDto,
  })
  @ValidateNested()
  @Type(() => VitalsChecklistDto)
  checklist: VitalsChecklistDto;

  @ApiPropertyOptional({
    description: 'Ward round notes — observations, patient complaints, interventions',
    example: 'Patient reports mild pain at surgical site. Wound dressing changed.',
  })
  @IsString()
  @IsOptional()
  nurseNotes?: string;
}
