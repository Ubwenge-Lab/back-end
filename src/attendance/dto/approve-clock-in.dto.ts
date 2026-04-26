// backend/src/attendance/dto/approve-clock-in.dto.ts

import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ApproveClockInDto {
  @ApiProperty({
    description: 'Optional notes from manager',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
