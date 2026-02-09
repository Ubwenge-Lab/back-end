// backend/src/attendance/dto/clock-out.dto.ts

import { IsOptional, IsObject, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ClockOutDto {
  @ApiProperty({ 
    description: 'GPS location (optional)',
    example: { latitude: -1.9441, longitude: 30.0619 },
    required: false 
  })
  @IsOptional()
  @IsObject()
  location?: {
    latitude: number;
    longitude: number;
  };

  @ApiProperty({ 
    description: 'Optional notes about the shift',
    required: false 
  })
  @IsOptional()
  @IsString()
  notes?: string;
}