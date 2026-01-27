// backend/src/pharmacies/dto/update-pharmacy.dto.ts

import { IsString, IsOptional, IsNumber, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePharmacyDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiProperty({ required: false, description: 'JSON array of delivery zones' })
  @IsObject()
  @IsOptional()
  deliveryZones?: any;

  @ApiProperty({ required: false, description: 'JSON object of operating hours' })
  @IsObject()
  @IsOptional()
  operatingHours?: any;
}