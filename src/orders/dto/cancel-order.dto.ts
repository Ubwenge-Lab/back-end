// backend/src/orders/dto/cancel-order.dto.ts

import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelOrderDto {
  @ApiProperty()
  @IsString()
  cancellationReason: string;
}