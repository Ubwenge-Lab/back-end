import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ActivateHospitalStaffDto {
  @ApiProperty({ example: 'dr.mutoni@test.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'EvXXXXXXXX1!' })
  @IsString()
  @IsNotEmpty()
  tempPassword: string;

  @ApiProperty({ example: 'MyNewPass@123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d|.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/,
    {
      message:
        'Password must contain uppercase, lowercase, and a number or symbol',
    },
  )
  newPassword: string;

  @ApiProperty({ example: 'MyNewPass@123' })
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}
