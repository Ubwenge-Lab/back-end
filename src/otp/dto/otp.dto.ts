// backend/src/otp/dto/otp.dto.ts
//
// Shapes mirror the existing email-verification DTOs (`verify-email.dto.ts`,
// `resend-verification.dto.ts`): the account is identified by `email`, which is
// the only unique account identifier in this schema, and the code proves
// something about the caller. Phone numbers are NOT unique here, so a phone can
// never stand in for the email.

import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OtpPurpose } from '@prisma/client';
import { PhoneRegion } from '../phone.util';

/** How many digits an OTP has. Kept here so the DTO and service agree. */
export const OTP_CODE_LENGTH = 6;

class OtpTargetDto {
  @ApiProperty({
    example: 'patient@example.com',
    description:
      'Identifies the account. Email is the only unique account key in the ' +
      'schema; phone numbers are not unique (shared handsets are common in ' +
      'RW/UG) and cannot identify a user.',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: '+250788123456',
    description:
      'The number to verify. Send E.164 where possible. A national number ' +
      '(0788123456) is accepted only alongside `region`, because 0788123456 ' +
      'is a valid shape in both Rwanda and Uganda.',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({
    enum: ['RW', 'UG'],
    example: 'RW',
    description:
      'Which market a national-format `phone` came from. Ignored when `phone` ' +
      'already carries a +250/+256 country code.',
  })
  @IsOptional()
  @IsEnum({ RW: 'RW', UG: 'UG' })
  region?: PhoneRegion;

  @ApiProperty({
    enum: OtpPurpose,
    example: OtpPurpose.PHONE_VERIFICATION,
    description:
      'What the code is for. A code issued for one purpose can never satisfy ' +
      'another.',
  })
  @IsEnum(OtpPurpose)
  purpose: OtpPurpose;
}

/** `POST /auth/otp/request` — issue a code. */
export class RequestOtpDto extends OtpTargetDto {}

/** `POST /auth/otp/resend` — reissue, subject to the cooldown. */
export class ResendOtpDto extends OtpTargetDto {}

/** `POST /auth/otp/verify` — redeem a code. */
export class VerifyOtpDto extends OtpTargetDto {
  @ApiProperty({
    example: '123456',
    description: `${OTP_CODE_LENGTH}-digit code delivered by SMS`,
  })
  @IsString()
  @IsNotEmpty()
  @Length(OTP_CODE_LENGTH, OTP_CODE_LENGTH, {
    message: `Code must be exactly ${OTP_CODE_LENGTH} digits`,
  })
  @Matches(/^\d+$/, { message: 'Code must be digits only' })
  code: string;
}
