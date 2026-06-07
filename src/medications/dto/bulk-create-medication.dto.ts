import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class BulkMedicationItemDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  chemicalName?: string;

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

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  requiresPrescription?: boolean;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  manufacturer?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  batchNumber?: string;

  @ApiProperty({ required: false, description: 'ISO date YYYY-MM-DD' })
  @IsString()
  @IsOptional()
  expiryDate?: string;
}

export class BulkCreateMedicationDto {
  @ApiProperty({ description: 'Branch where all medications will be added' })
  @IsString()
  branchId: string;

  @ApiProperty({ type: [BulkMedicationItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkMedicationItemDto)
  medications: BulkMedicationItemDto[];
}
