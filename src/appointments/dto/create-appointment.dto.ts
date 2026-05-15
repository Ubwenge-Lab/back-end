import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({ example: 'uuid-of-doctor', description: 'Doctor UUID' })
  @IsUUID()
  doctorId: string;

  @ApiProperty({ example: 'uuid-of-patient', description: 'Patient UUID' })
  @IsUUID()
  patientId: string;

  @ApiProperty({ example: 'uuid-of-hospital', description: 'Hospital UUID' })
  @IsUUID()
  hospitalId: string;

  @ApiProperty({
    example: '2026-05-15T09:00:00.000Z',
    description: 'Appointment date and time (ISO 8601)',
  })
  @IsDateString()
  scheduledAt: string;

  @ApiProperty({
    example: 'Chest pain and shortness of breath',
    description: 'Reason for visit',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
