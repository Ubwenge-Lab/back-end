// backend/src/patients/dto/update-patient.dto.ts

import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePatientDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  gender?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  insuranceProvider?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  insurancePolicy?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  insuranceMemberId?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  insuranceCoverage?: number;
}
