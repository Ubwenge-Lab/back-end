import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class DoctorFilterDto {
  @ApiPropertyOptional({ example: 'Cardiology', description: 'Filter by specialization' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ example: true, description: 'Filter by availability' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  available?: boolean;
}
