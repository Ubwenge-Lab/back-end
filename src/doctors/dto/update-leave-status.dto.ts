import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum LeaveAction {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class UpdateLeaveStatusDto {
  @ApiProperty({ enum: LeaveAction, example: LeaveAction.APPROVED })
  @IsEnum(LeaveAction)
  status: LeaveAction;

  @ApiProperty({
    required: false,
    example: 'Insufficient staffing during this period',
    description: 'Required when rejecting a leave request',
  })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
