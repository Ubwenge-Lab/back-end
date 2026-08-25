import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DischargeAdmissionDto {
  @ApiPropertyOptional({
    description: 'Clinical discharge notes from attending doctor',
    example: 'Patient fit for discharge. Continue oral antibiotics for 5 days.',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
