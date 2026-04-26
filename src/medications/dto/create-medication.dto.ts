// backend/src/medications/dto/create-medication.dto.ts

import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMedicationDto {
  @ApiProperty({ description: 'Branch ID where this medication is stocked' })
  @IsString()
  branchId: string;

  @ApiProperty({
    description: 'Optional ID from the FDA registry to auto-fill details',
    required: false,
  })
  @IsString()
  @IsOptional()
  registryId?: string;

  @ApiProperty()
  @ValidateIf((o) => !o.registryId)
  @IsString()
  name?: string;

  @ApiProperty({
    required: false,
    description: 'Chemical/generic name of the medication',
  })
  @IsString()
  @IsOptional()
  chemicalName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsString()
  category: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({ required: false, default: 10 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  lowStockThreshold?: number;

  @ApiProperty({ default: false })
  @IsBoolean()
  requiresPrescription: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  imageUrl?: string;
}
