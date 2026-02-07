// backend/src/staff/dto/create-staff.dto.ts

import { 
  IsEmail, 
  IsNotEmpty, 
  IsString, 
  IsEnum, 
  IsArray, 
  IsOptional, 
  IsDateString,
  MinLength,
  MaxLength 
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { StaffPermission } from '../../common/constants/staff-permission.enum';
import { Transform } from 'class-transformer';

export class CreateStaffDto {
  @ApiProperty({ example: 'John' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }) => value?.trim())
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }) => value?.trim())
  lastName: string;

  @ApiProperty({ example: 'staff@pharmacy.com' })
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({ example: '+250788123456', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ enum: ['PHARMACIST', 'CASHIER', 'NURSE'], example: 'PHARMACIST' })
  @IsNotEmpty()
  @IsEnum(['PHARMACIST', 'CASHIER', 'NURSE'])
  role: 'PHARMACIST' | 'CASHIER' | 'NURSE';

  @ApiProperty({ 
    description: 'Array of permission strings',
    example: ['VIEW_ORDERS', 'ACCEPT_ORDERS', 'VIEW_INVENTORY'],
    isArray: true 
  })
  @IsArray()
  @IsEnum(StaffPermission, { each: true })
  permissions: StaffPermission[];

  @ApiProperty({ example: '1199012345678', required: false })
  @IsOptional()
  @IsString()
  @MinLength(13)
  @MaxLength(16)
  nationalId?: string;

  @ApiProperty({ enum: ['Male', 'Female', 'Other'], required: false })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiProperty({ example: '1990-01-15', required: false })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ 
    description: 'Working hours schedule in JSON format',
    example: { monday: '08:00-17:00', tuesday: '08:00-17:00' },
    required: false 
  })
  @IsOptional()
  workingHours?: any;
}