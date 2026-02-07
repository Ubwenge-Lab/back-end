// backend/src/orders/dto/create-order.dto.ts

import { IsString, IsArray, IsNumber, IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class OrderItemDto {
  @ApiProperty()
  @IsString()
  medicationId: string;

  @ApiProperty()
  @IsNumber()
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty()
  @IsString()
  pharmacyId: string;

  @ApiProperty({ description: 'Branch ID where the order will be fulfilled' })
  @IsString()
  branchId: string;

  @ApiProperty({ enum: ['DELIVERY', 'PICKUP'] })
  @IsEnum(['DELIVERY', 'PICKUP'])
  type: 'DELIVERY' | 'PICKUP';

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  deliveryAddress?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  prescriptionId?: string;

  @ApiProperty({ enum: ['MTN_MOMO', 'AIRTEL_MONEY', 'CARD', 'INSURANCE'] })
  @IsEnum(['MTN_MOMO', 'AIRTEL_MONEY', 'CARD', 'INSURANCE'])
  paymentMethod: 'MTN_MOMO' | 'AIRTEL_MONEY' | 'CARD' | 'INSURANCE';

  // For insurance payments
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  insuranceProvider?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  insurancePolicyNumber?: string;
}