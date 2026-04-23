// backend/src/auth/dto/register-pharmacy.dto.ts

import { IsString, IsEmail, IsNotEmpty, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterPharmacyDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  pharmacyName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  representativeName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ description: 'GPS latitude of pharmacy location (required)' })
  @IsNumber()
  latitude: number;

  @ApiProperty({ description: 'GPS longitude of pharmacy location (required)' })
  @IsNumber()
  longitude: number;

  @ApiProperty({ description: 'Date of pharmacy incorporation/establishment' })
  @IsDateString()
  dateOfIncorporation: string;

  @ApiProperty({ description: 'RDB (Rwanda Development Board) certificate' })
  @IsString()
  @IsNotEmpty()
  rdbCertificate: string;

  @ApiProperty({ description: 'Pharmacy license number/certificate' })
  @IsString()
  @IsNotEmpty()
  pharmacyLicense: string;

  @ApiProperty({ description: 'Business registration certificate/number' })
  @IsString()
  @IsNotEmpty()
  businessRegistration: string;
}