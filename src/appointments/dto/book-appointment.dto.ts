import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class BookAppointmentDto {
  @ApiProperty({ example: 'uuid-of-doctor' })
  @IsUUID()
  doctorId: string;

  @ApiProperty({
    example: '2026-05-20T09:00:00.000Z',
    description: 'Slot datetime in ISO 8601',
  })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 'Chest pain and shortness of breath' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ example: 'Patient has history of hypertension' })
  @IsOptional()
  @IsString()
  notes?: string;
}
