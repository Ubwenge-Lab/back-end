import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class RecordPaymentDto {
  @ApiProperty({
    description: 'The ID of the order to record payment for',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  orderId: string;

  @ApiProperty({
    description: 'The payment method used',
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
  })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty({
    description: 'The amount received from the customer',
    example: 15000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  amountReceived: number;

  @ApiProperty({
    description: 'Insurance provider name (required if method is INSURANCE)',
    example: 'Radiant Health Insurance',
    required: false,
  })
  @IsOptional()
  @IsString()
  insuranceProvider?: string;

  @ApiProperty({
    description: 'Insurance policy number (required if method is INSURANCE)',
    example: 'POL-123456789',
    required: false,
  })
  @IsOptional()
  @IsString()
  insurancePolicyNumber?: string;
}
