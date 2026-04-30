// backend/src/auth/dto/register-pharmacy.dto.ts

import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsDateString,
  Min,
  Max,
  IsOptional,
} from 'class-validator';
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

  @ApiProperty({
    description:
      'GPS latitude of pharmacy location, must be between -90 and 90 (required)',
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({
    description:
      'GPS longitude of pharmacy location, must be between -180 and 180 (required)',
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(-180)
  @Max(180)
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
