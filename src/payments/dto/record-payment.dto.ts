// backend/src/payments/dto/record-payment.dto.ts

import { IsString, IsEnum, IsNumber, Min, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecordPaymentDto {
  @ApiProperty({ description: 'Order ID to record payment for' })
  @IsString()
  orderId: string;

  @ApiProperty({
    description: 'Payment method used for the recorded payment',
    enum: ['MTN_MOMO', 'AIRTEL_MONEY', 'CARD', 'CASH', 'INSURANCE'],
  })
  @IsEnum(['MTN_MOMO', 'AIRTEL_MONEY', 'CARD', 'CASH', 'INSURANCE'])
  paymentMethod: 'MTN_MOMO' | 'AIRTEL_MONEY' | 'CARD' | 'CASH' | 'INSURANCE';

  @ApiProperty({ description: 'Amount received from the customer' })
  @IsNumber()
  @Min(0)
  amountReceived: number;

  @ApiProperty({
    required: false,
    description: 'Phone number for mobile money payments',
  })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiProperty({
    required: false,
    description: 'Insurance provider for insurance payments',
  })
  @IsString()
  @IsOptional()
  insuranceProvider?: string;

  @ApiProperty({
    required: false,
    description: 'Insurance policy number for insurance payments',
  })
  @IsString()
  @IsOptional()
  insurancePolicyNumber?: string;

  @ApiProperty({
    required: false,
    description:
      'Optional payment reference for manual card or mobile money receipts',
  })
  @IsString()
  @IsOptional()
  reference?: string;
}
