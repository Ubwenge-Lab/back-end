import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsArray,
  IsOptional,
  IsEnum,
  ValidateNested,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SurgicalRole } from '@prisma/client';

export class TeamAssignmentDto {
  @ApiProperty({ example: 'SURGEON', enum: SurgicalRole, enumName: 'SurgicalRole' })
  @IsEnum(SurgicalRole)
  role: SurgicalRole;

  @ApiProperty({ required: false, example: 'doctor-uuid-here' })
  @IsString()
  @IsOptional()
  doctorId?: string;

  @ApiProperty({ required: false, example: 'staff-uuid-here' })
  @IsString()
  @IsOptional()
  hospitalStaffId?: string;
}

export class CreateSurgeryBookingDto {
  @ApiProperty({ example: 'theater-uuid-here' })
  @IsString()
  @IsNotEmpty()
  theaterId: string;

  @ApiProperty({ example: 'patient-uuid-here' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ example: 'Laparoscopic Cholecystectomy' })
  @IsString()
  @IsNotEmpty()
  procedureName: string;

  @ApiProperty({ example: '2026-06-20T09:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({ example: '2026-06-20T11:30:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  endTime: string;

  @ApiProperty({ example: ['Laparoscope', 'Harmonic Scalpel'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  requiredEquipment?: string[];

  @ApiProperty({ type: [TeamAssignmentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamAssignmentDto)
  teamAssignments: TeamAssignmentDto[];
}

export class LogPostOpReportDto {
  @ApiProperty({ example: 145 })
  @IsInt()
  @IsNotEmpty()
  durationMinutes: number;

  @ApiProperty({ example: 'General anesthesia with Propofol and Isoflurane' })
  @IsString()
  @IsNotEmpty()
  anesthesiaDetails: string;

  @ApiProperty({
    example: 'Gallbladder safely isolated and resected. Clear margins.',
  })
  @IsString()
  @IsNotEmpty()
  operationNotes: string;

  @ApiProperty({ example: 'None. Minimal blood loss.' })
  @IsString()
  @IsOptional()
  complications?: string;

  @ApiProperty({ example: 'SUCCESS' })
  @IsString()
  @IsNotEmpty()
  outcome: string;
}
