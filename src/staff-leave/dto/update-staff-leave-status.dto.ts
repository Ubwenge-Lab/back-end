import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveStatus } from '@prisma/client';

export class UpdateStaffLeaveStatusDto {
  @ApiProperty({ enum: [LeaveStatus.APPROVED, LeaveStatus.REJECTED] })
  @IsEnum([LeaveStatus.APPROVED, LeaveStatus.REJECTED])
  @IsNotEmpty()
  status: LeaveStatus;

  @ApiPropertyOptional({ description: 'Optional note to the staff member' })
  @IsString()
  @IsOptional()
  reviewNote?: string;
}
