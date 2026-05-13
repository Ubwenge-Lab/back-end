import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetDoctorsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter doctors by their specialization',
    example: 'Cardiology',
  })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({
    description: 'Filter doctors by the hospital ID they belong to',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsUUID()
  hospital_id?: string;
}
