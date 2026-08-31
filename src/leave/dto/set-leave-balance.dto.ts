// backend/src/leave/dto/set-leave-balance.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LeaveType } from '@prisma/client';

export class SetLeaveBalanceDto {
  @ApiProperty({ description: 'User ID (the employee whose leave allocation is being set).' })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2020)
  @Max(2100)
  year: number;

  @ApiProperty({ enum: LeaveType, default: LeaveType.ANNUAL, required: false })
  @IsOptional()
  @IsEnum(LeaveType)
  leaveType?: LeaveType;

  @ApiProperty({ example: 18, description: 'Number of days allocated for this leave type/year.' })
  @IsNumber()
  @Min(0)
  @Max(365)
  allocatedDays: number;

  @ApiProperty({ required: false, example: 'Pro-rated for mid-year hire.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
