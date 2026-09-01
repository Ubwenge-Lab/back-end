// backend/src/leave/dto/create-leave-request.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { LeaveType } from '@prisma/client';

export class CreateLeaveRequestDto {
  @ApiProperty({ enum: LeaveType, example: LeaveType.ANNUAL })
  @IsEnum(LeaveType)
  leaveType: LeaveType;

  @ApiProperty({ example: '2026-09-10' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-09-14' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ example: 'Family trip to visit relatives.' })
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @ApiProperty({
    required: false,
    description: 'URL of a supporting document (e.g. medical certificate for sick leave).',
  })
  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}
