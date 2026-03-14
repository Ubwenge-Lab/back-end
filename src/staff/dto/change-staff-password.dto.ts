// backend/src/staff/dto/change-staff-password.dto.ts

import { IsNotEmpty, IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeStaffPasswordDto {
  @ApiProperty({ description: 'Temporary password received via email' })
  @IsNotEmpty()
  @IsString()
  tempPassword: string;

  @ApiProperty({ description: 'New permanent password' })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
    message: 'Password must be at least 8 characters with uppercase, lowercase, number and special character',
  })
  newPassword: string;

  @ApiProperty({ description: 'Confirm new password' })
  @IsNotEmpty()
  @IsString()
  confirmPassword: string;
}