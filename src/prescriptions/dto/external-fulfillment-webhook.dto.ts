import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  ArrayNotEmpty,
  ArrayUnique,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum FulfillmentStatus {
  FULFILLED = 'FULFILLED',
  PARTIALLY_FULFILLED = 'PARTIALLY_FULFILLED',
}

export class ExternalFulfillmentWebhookDto {
  @ApiProperty({ example: 'EVUZE-PRESC-2026-123456' })
  @IsString()
  @IsNotEmpty()
  prescriptionId: string;

  @ApiProperty({ example: 'pharmacy-uuid-here' })
  @IsString()
  @IsNotEmpty()
  pharmacyId: string;

  @ApiProperty({
    example: ['item-uuid-1', 'item-uuid-2'],
    description: 'IDs of the PrescriptionMedication rows being fulfilled',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  prescriptionMedicationIds: string[];

  @ApiProperty({
    enum: FulfillmentStatus,
    example: FulfillmentStatus.FULFILLED,
  })
  @IsEnum(FulfillmentStatus)
  status: FulfillmentStatus;

  @ApiPropertyOptional({
    example: 'Dispensed full 7-day course at branch counter',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
