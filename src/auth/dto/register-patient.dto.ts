// backend/src/auth/dto/register-patient.dto.ts

import { IsEmail, IsNotEmpty, IsString, IsOptional, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterPatientDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d|.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/, {
    message: 'Password must contain uppercase, lowercase, and number or symbol',
  })
  password: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  gender?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  insuranceProvider?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  insurancePolicy?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @isNumber()
  latitude?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @isNumber()
  longitude?: number;
}
