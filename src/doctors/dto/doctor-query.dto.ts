import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DoctorQueryDto {
  @ApiPropertyOptional({
    description: 'Filter doctors by specialty (e.g., Cardiology)',
    example: 'Cardiology',
  })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({
    description: 'Filter doctors by hospital ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsUUID()
  hospital_id?: string;
}