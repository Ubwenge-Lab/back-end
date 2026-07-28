import { IsEnum, IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum HospitalPaymentWebhookStatus {
  SUCCESSFUL = 'SUCCESSFUL',
  FAILED = 'FAILED',
}

export class HospitalPaymentWebhookDto {
  @ApiProperty({ description: 'HospitalInvoice ID to settle' })
  @IsString()
  @IsNotEmpty()
  invoiceId: string;

  @ApiProperty({ enum: HospitalPaymentWebhookStatus })
  @IsEnum(HospitalPaymentWebhookStatus)
  status: HospitalPaymentWebhookStatus;

  @ApiPropertyOptional({ description: 'External transaction reference' })
  @IsString()
  @IsOptional()
  transactionRef?: string;
}
