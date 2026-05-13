import { ApiProperty } from '@nestjs/swagger';

export class DoctorResponseDto {
  @ApiProperty({
    description: 'Doctor ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Doctor first name',
    example: 'John',
  })
  firstName: string;

  @ApiProperty({
    description: 'Doctor last name',
    example: 'Doe',
  })
  lastName: string;

  @ApiProperty({
    description: 'Doctor specialty',
    example: 'Cardiology',
  })
  specialty: string;

  @ApiProperty({
    description: 'Doctor email',
    example: 'john.doe@hospital.com',
  })
  email: string;

  @ApiProperty({
    description: 'Doctor phone number',
    example: '+250788123456',
  })
  phone: string;

  @ApiProperty({
    description: 'Hospital ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  hospitalId: string;

  @ApiProperty({
    description: 'Hospital name',
    example: 'King Faisal Hospital',
  })
  hospitalName: string;

  @ApiProperty({
    description: 'Hospital phone number',
    example: '+250788987654',
  })
  hospitalPhone: string;

  @ApiProperty({
    description: 'Doctor status',
    example: 'ACTIVE',
  })
  status: string;

  @ApiProperty({
    description: 'Doctor license number',
    example: 'MED123456',
  })
  licenseNumber: string;

  @ApiProperty({
    description: 'Doctor bio',
    example: 'Cardiologist with 10 years of experience',
    required: false,
  })
  bio?: string;

  @ApiProperty({
    description: 'Created at timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Updated at timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  updatedAt: Date;
}