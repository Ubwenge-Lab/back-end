// backend/src/pos/dto/create-pos-sale.dto.ts

import {
  IsString,
  IsArray,
  IsNumber,
  IsEnum,
  IsOptional,
  ValidateNested,
  Min,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PosSaleItemDto {
  @ApiProperty({ description: 'Medication ID' })
  @IsString()
  medicationId: string;

  @ApiProperty({ description: 'Quantity to sell', minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreatePosSaleDto {
  @ApiProperty({ type: [PosSaleItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosSaleItemDto)
  items: PosSaleItemDto[];

  @ApiProperty({
    enum: ['MTN_MOMO', 'AIRTEL_MONEY', 'CARD', 'INSURANCE', 'CASH'],
    description: 'Payment method',
  })
  @IsEnum(['MTN_MOMO', 'AIRTEL_MONEY', 'CARD', 'INSURANCE', 'CASH'])
  paymentMethod: 'MTN_MOMO' | 'AIRTEL_MONEY' | 'CARD' | 'INSURANCE' | 'CASH';

  @ApiProperty({ description: 'Amount received from customer' })
  @IsNumber()
  @Min(0)
  amountReceived: number;

  @ApiPropertyOptional({ description: 'Optional discount amount' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @ApiPropertyOptional({
    description: 'Walk-in patient name (if unregistered)',
  })
  @IsString()
  @IsOptional()
  patientName?: string;

  @ApiPropertyOptional({ description: 'Walk-in patient phone' })
  @IsString()
  @IsOptional()
  patientPhone?: string;

  @ApiPropertyOptional({ description: 'Registered patient ID (if available)' })
  @IsString()
  @IsOptional()
  patientId?: string;

  @ApiPropertyOptional({
    description: 'Linked prescription ID (if patient presents one)',
  })
  @IsString()
  @IsOptional()
  prescriptionId?: string;

  @ApiPropertyOptional({ description: 'Sale notes or remarks' })
  @IsString()
  @IsOptional()
  notes?: string;
}
