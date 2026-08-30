import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveType } from '@prisma/client';

export class CreateStaffLeaveDto {
  @ApiProperty({ enum: LeaveType, default: LeaveType.ANNUAL })
  @IsEnum(LeaveType)
  type: LeaveType;

  @ApiProperty({ description: 'Leave start date (ISO)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Leave end date (ISO, >= startDate)' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Reason for the leave' })
  @IsString()
  @MinLength(3)
  @IsOptional()
  reason?: string;
}
