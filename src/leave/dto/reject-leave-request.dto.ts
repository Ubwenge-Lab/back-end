// backend/src/leave/dto/reject-leave-request.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RejectLeaveRequestDto {
  @ApiProperty({ example: 'Not enough coverage on the requested dates.' })
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  rejectionReason: string;
}
