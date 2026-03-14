// backend/src/attendance/dto/reject-clock-in.dto.ts

import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectClockInDto {
  @ApiProperty({ 
    description: 'Reason for rejection',
    example: 'Not scheduled to work today'
  })
  @IsString()
  reason: string;
}