import { IsString, IsNotEmpty, IsArray, ValidateNested, IsInt, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class HospitalMedicationItemDto {
  @ApiProperty({ example: 'Amoxicillin 500mg' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '1 capsule' })
  @IsString()
  @IsNotEmpty()
  dosage: string;

  @ApiProperty({ example: '3 times daily' })
  @IsString()
  @IsNotEmpty()
  frequency: string;

  @ApiProperty({ example: '7 days' })
  @IsString()
  @IsNotEmpty()
  duration: string;

  @ApiPropertyOptional({ example: 21 })
  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;
}

export class HospitalIssuePrescriptionDto {
  @ApiProperty({ example: 'patient-uuid-here' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ example: 'hospital-uuid-here' })
  @IsString()
  @IsNotEmpty()
  hospitalId: string;

  @ApiProperty({ example: 'appointment-uuid-here' })
  @IsString()
  @IsNotEmpty()
  appointmentId: string;

  @ApiProperty({ type: [HospitalMedicationItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HospitalMedicationItemDto)
  medications: HospitalMedicationItemDto[];
}
