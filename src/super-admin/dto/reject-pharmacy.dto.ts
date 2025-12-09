// backend/src/super-admin/dto/reject-pharmacy.dto.ts

import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectPharmacyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason: string;
}
