// backend/src/attendance/dto/reject-clock-out.dto.ts

import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectClockOutDto {
  @ApiProperty({
    description: 'Reason for rejection',
    example: 'Clock out time incorrect',
  })
  @IsString()
  reason: string;
}
