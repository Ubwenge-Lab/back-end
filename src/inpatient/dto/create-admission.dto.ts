import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAdmissionDto {
  @ApiProperty({ example: 'patient-uuid' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ example: 'hospital-uuid' })
  @IsString()
  @IsNotEmpty()
  hospitalId: string;

  @ApiProperty({ example: 'Post-operative recovery after appendectomy' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ example: 'Surgical Ward A' })
  @IsString()
  @IsOptional()
  wardName?: string;

  @ApiPropertyOptional({ example: 'Bed 12' })
  @IsString()
  @IsOptional()
  bedNumber?: string;

  @ApiPropertyOptional({ example: 'ward-uuid' })
  @IsString()
  @IsOptional()
  wardId?: string;

  @ApiPropertyOptional({ example: 'room-uuid' })
  @IsString()
  @IsOptional()
  roomId?: string;

  @ApiPropertyOptional({ example: 'bed-uuid' })
  @IsString()
  @IsOptional()
  bedId?: string;
}