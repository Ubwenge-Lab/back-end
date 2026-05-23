import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OnboardHospitalStaffDto {
  @ApiProperty({ example: 'dr.mutoni@cityhospital.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Amina' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Mutoni' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional({ example: '+250780000001' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ enum: ['DOCTOR', 'NURSE', 'RECEPTIONIST'] })
  @IsEnum(['DOCTOR', 'NURSE', 'RECEPTIONIST'])
  role: 'DOCTOR' | 'NURSE' | 'RECEPTIONIST';

  @ApiPropertyOptional({
    example: 'Cardiology',
    description: 'Required when role is DOCTOR',
  })
  @IsOptional()
  @IsString()
  specialization?: string;

  @ApiPropertyOptional({
    example: 'RW-MED-2024-001',
    description: 'Required when role is DOCTOR',
  })
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @ApiPropertyOptional({
    example:
      'Specialist in interventional cardiology with 10 years of experience.',
  })
  @IsOptional()
  @IsString()
  bio?: string;
}
