import { IsNotEmpty, IsString, IsEnum, IsNumber, IsOptional, IsPhoneNumber } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateCheckoutSessionDto {
  @IsString()
  @IsNotEmpty()
  invoiceId: string; // Accepts the HospitalInvoice ID

  @IsEnum(PaymentMethod, {
    message: 'Method must be either MTN_MOMO, AIRTEL_MONEY, or CARD',
  })
  method: PaymentMethod;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsOptional()
  phoneNumber?: string;
}

export class MockWebhookDto {
  @IsString()
  @IsNotEmpty()
  transactionReference: string; // The HospitalPayment ID record

  @IsEnum(['SUCCESS', 'FAILED'])
  status: 'SUCCESS' | 'FAILED';
}