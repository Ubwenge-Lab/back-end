// backend/src/attendance/dto/clock-in.dto.ts

import { IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ClockInDto {
  @ApiProperty({
    description: 'GPS location (optional)',
    example: { latitude: -1.9441, longitude: 30.0619 },
    required: false,
  })
  @IsOptional()
  @IsObject()
  location?: {
    latitude: number;
    longitude: number;
  };
}
