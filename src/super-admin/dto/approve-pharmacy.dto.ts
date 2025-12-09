// backend/src/super-admin/dto/approve-pharmacy.dto.ts

import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ApprovePharmacyDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  note?: string;
}