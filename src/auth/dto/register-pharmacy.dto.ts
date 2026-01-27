// backend/src/auth/dto/register-pharmacy.dto.ts

import { IsEmail, IsNotEmpty, IsString, IsOptional, IsNumber, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterPharmacyDto {
  @ApiProperty({ description: 'Pharmacy business name' })
  @IsString()
  @IsNotEmpty()
  pharmacyName: string;

  @ApiProperty({ description: 'Representative name (must match RDB certificate)' })
  @IsString()
  @IsNotEmpty()
  representativeName: string;

  @ApiProperty({ description: 'Pharmacy email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Password (min 8 characters, uppercase, lowercase, number or symbol)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d|.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/, {
    message: 'Password must contain uppercase, lowercase, and number or symbol',
  })
  password: string;

  @ApiProperty({ description: 'Confirm password' })
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;

  @ApiProperty({ description: 'Contact phone number' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ description: 'Pharmacy physical address' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ required: false, description: 'Latitude coordinate' })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiProperty({ required: false, description: 'Longitude coordinate' })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiProperty({ description: 'Date of incorporation (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty()
  dateOfIncorporation: string;

  @ApiProperty({ description: 'RDB Certificate document (S3 URL or base64)' })
  @IsString()
  @IsNotEmpty()
  rdbCertificate: string;

  @ApiProperty({ description: 'Pharmacy License document (S3 URL or base64)' })
  @IsString()
  @IsNotEmpty()
  pharmacyLicense: string;
}
