// backend/src/auth/dto/verify-email.dto.ts

import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({ example: 'patient@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '12345', description: '5-digit verification code' })
  @IsString()
  @IsNotEmpty()
  @Length(5, 5, { message: 'Verification code must be exactly 5 digits' })
  code: string;
}
