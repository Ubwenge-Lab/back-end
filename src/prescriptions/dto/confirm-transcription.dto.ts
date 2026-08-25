// backend/src/prescriptions/dto/confirm-transcription.dto.ts
// UGANDA: Pharmacist confirms/corrects AI-extracted medications and optionally
// converts the prescription into a structured order.

import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmTranscriptionItemDto {
  @ApiPropertyOptional({ description: 'Matched medication ID from branch inventory' })
  @IsString()
  @IsOptional()
  medicationId?: string;

  @ApiProperty({ description: 'Medication name (as written or corrected)' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  dosage?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  frequency?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  duration?: string;

  @ApiProperty({ description: 'Quantity to dispense', minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class ConfirmTranscriptionDto {
  @ApiProperty({ type: [ConfirmTranscriptionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmTranscriptionItemDto)
  items: ConfirmTranscriptionItemDto[];

  @ApiPropertyOptional({
    enum: ['PICKUP', 'DELIVERY'],
    description: 'Order type when createOrder is true',
  })
  @IsEnum(['PICKUP', 'DELIVERY'])
  @IsOptional()
  type?: 'PICKUP' | 'DELIVERY';

  @ApiPropertyOptional({
    description: 'Create a structured order after confirming the transcription',
  })
  @IsBoolean()
  @IsOptional()
  createOrder?: boolean;

  @ApiPropertyOptional({
    enum: ['MTN_MOMO', 'AIRTEL_MONEY', 'CARD', 'INSURANCE', 'CASH'],
  })
  @IsEnum(['MTN_MOMO', 'AIRTEL_MONEY', 'CARD', 'INSURANCE', 'CASH'])
  @IsOptional()
  paymentMethod?: 'MTN_MOMO' | 'AIRTEL_MONEY' | 'CARD' | 'INSURANCE' | 'CASH';
}
