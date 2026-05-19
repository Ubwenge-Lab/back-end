import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsPhoneNumber,
} from 'class-validator';

export class CreateDoctorDto {
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

  @ApiProperty({ example: 'Cardiology' })
  @IsString()
  @IsNotEmpty()
  specialization: string;

  @ApiProperty({ example: 'RW-MED-2024-001' })
  @IsString()
  @IsNotEmpty()
  licenseNumber: string;

  @ApiPropertyOptional({
    example:
      'Specialist in interventional cardiology with 10 years of experience.',
  })
  @IsOptional()
  @IsString()
  bio?: string;
}
