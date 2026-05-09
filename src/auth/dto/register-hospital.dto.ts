import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterHospitalDto {
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
  hospitalName: string;

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

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  dateOfIncorporation?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  rdbCertificate?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  pharmacyLicense?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  businessRegistration?: string;
}
