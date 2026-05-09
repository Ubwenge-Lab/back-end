import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class OnboardHospitalStaffDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ enum: ['DOCTOR', 'NURSE', 'RECEPTIONIST'] })
  @IsEnum(['DOCTOR', 'NURSE', 'RECEPTIONIST'])
  role: 'DOCTOR' | 'NURSE' | 'RECEPTIONIST';
}
