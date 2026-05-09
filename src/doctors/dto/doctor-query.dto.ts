import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class DoctorQueryDto {
  @ApiProperty({
    description: 'Filter by specialty',
    example: 'Cardiology',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  specialty?: string;

  @ApiProperty({
    description: 'Filter by hospital ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  hospital_id?: string;
}
