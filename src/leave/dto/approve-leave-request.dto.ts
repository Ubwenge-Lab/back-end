// backend/src/leave/dto/approve-leave-request.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveLeaveRequestDto {
  @ApiProperty({ required: false, example: 'Approved, please hand over your open tasks.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
