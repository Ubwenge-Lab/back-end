// backend/src/staff/dto/update-staff.dto.ts

import {
  IsString,
  IsIn,
  IsArray,
  IsOptional,
  IsDateString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { StaffPermission } from '../../common/constants/staff-permission.enum';
import { StaffStatus } from '@prisma/client';
import { Transform } from 'class-transformer';

export class UpdateStaffDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }: { value: string }) => value?.trim())
  firstName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }: { value: string }) => value?.trim())
  lastName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({
    description: 'Update staff permissions',
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsIn(Object.values(StaffPermission), { each: true })
  permissions?: StaffPermission[];

  @ApiProperty({ enum: StaffStatus, required: false })
  @IsOptional()
  @IsIn(Object.values(StaffStatus))
  status?: StaffStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  workingHours?: any;
}
