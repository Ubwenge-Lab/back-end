// backend/src/lab-results/dto/reject-lab-order.dto.ts

import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectLabOrderDto {
  @ApiProperty({ description: 'Mandatory reason for rejecting/cancelling the lab order' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
