import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DoctorDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'uuid-string' })
  userId: string;

  @ApiProperty({ example: 'uuid-string' })
  hospitalId: string;

  @ApiProperty({ example: 'Cardiology' })
  specialization: string;

  @ApiProperty({ example: 'LIC-12345' })
  licenseNumber: string;

  @ApiPropertyOptional({ example: 'Experienced cardiologist with 10 years of practice.' })
  bio?: string | null;

  @ApiProperty({ example: 'dr.smith@cityhospital.com', nullable: true })
  email: string | null;

  @ApiProperty({ example: 'City Central Hospital', nullable: true })
  hospitalName: string | null;

  @ApiProperty({ example: 'KN 3 Ave, Kigali', nullable: true })
  hospitalAddress: string | null;
}
