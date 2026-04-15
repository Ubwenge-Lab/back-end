// backend/src/payments/dto/checkout.dto.ts

import {
  IsString,
  IsArray,
  IsEnum,
  IsOptional,
  ValidateNested,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class CheckoutItemDto {
  @ApiProperty({ description: 'Medication ID' })
  @IsString()
  medicationId: string;

  @ApiProperty({ description: 'Quantity to purchase', minimum: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;
}

export class CheckoutDto {
  // Order details
  @ApiProperty({ description: 'Pharmacy ID' })
  @IsString()
  pharmacyId: string;

  @ApiProperty({ description: 'Branch ID where the order will be fulfilled' })
  @IsString()
  branchId: string;

  @ApiProperty({ enum: ['DELIVERY', 'PICKUP'] })
  @IsEnum(['DELIVERY', 'PICKUP'])
  type: 'DELIVERY' | 'PICKUP';

  @ApiProperty({ type: [CheckoutItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[];

  @ApiProperty({
    required: false,
    description: 'Required when type is DELIVERY',
  })
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

  // Payment details
  @ApiProperty({
    required: false,
    description:
      'Patient phone number — required for MTN_MOMO and AIRTEL_MONEY',
  })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  // Insurance
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  insuranceProvider?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  insurancePolicyNumber?: string;
}
