import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TransferBedDto {
  @ApiProperty({ description: 'Target Bed UUID to transfer the patient to', example: 'bed-uuid-123' })
  @IsString()
  @IsNotEmpty()
  targetBedId: string;

  @ApiPropertyOptional({ description: 'Reason for transferring patient', example: 'Patient step-down to standard room' })
  @IsString()
  @IsOptional()
  reason?: string;
}