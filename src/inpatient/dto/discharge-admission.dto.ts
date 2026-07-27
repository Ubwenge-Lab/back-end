import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class DischargeAdmissionDto {
  @ApiPropertyOptional({ description: 'Clinical discharge notes from attending doctor', example: 'Patient fit for discharge. Continue oral antibiotics for 5 days.' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Explicit clinical clearance by doctor', example: true })
  @IsBoolean()
  @IsOptional()
  clinicalClearance?: boolean;

  @ApiPropertyOptional({ description: 'Explicit billing clearance', example: true })
  @IsBoolean()
  @IsOptional()
  billingClearance?: boolean;
}