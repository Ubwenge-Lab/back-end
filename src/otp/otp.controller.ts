// backend/src/otp/otp.controller.ts
//
// Mounted at `auth/otp` so the routes read as
// `POST /api/auth/otp/{request,verify,resend}` and sit alongside the existing
// email-verification routes in Swagger, while the implementation stays in its
// own module.

import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { OtpService } from './otp.service';
import { RequestOtpDto, ResendOtpDto, VerifyOtpDto } from './dto/otp.dto';

@ApiTags('Authentication')
@Controller('auth/otp')
// Tighter than the 5/min the auth controller uses: each request here can cost
// real money once an SMS provider is wired in, and the per-account cooldown
// inside the service is a separate, complementary gate.
@Throttle({ default: { limit: 3, ttl: 60000 } })
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a phone-verification OTP',
    description:
      'Issues a 6-digit code, valid for 10 minutes. The account is identified ' +
      'by email; the code proves the caller holds the phone. Responds ' +
      'identically whether or not the account exists, so this cannot be used ' +
      'to enumerate registered addresses. Re-requesting inside the 60s ' +
      'cooldown is idempotent: the live code stands and no new SMS is sent.',
  })
  @ApiResponse({ status: 200, description: 'Code issued (or already live).' })
  @ApiResponse({ status: 400, description: 'Phone is not a RW/UG mobile.' })
  @ApiResponse({ status: 429, description: 'Send quota exhausted.' })
  request(@Body() dto: RequestOtpDto) {
    return this.otpService.requestOtp(dto);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a phone-verification OTP',
    description:
      'Redeems a code and records the proven number on the user ' +
      '(`verifiedPhone`, `phoneVerifiedAt`). The code is single-use, and the ' +
      'phone must match the number the code was issued for. Five incorrect ' +
      'attempts burn the code.',
  })
  @ApiResponse({ status: 200, description: 'Phone verified.' })
  @ApiResponse({
    status: 400,
    description: 'Invalid, expired, or exhausted code.',
  })
  verify(@Body() dto: VerifyOtpDto) {
    return this.otpService.verifyOtp(dto);
  }

  @Post('resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend a phone-verification OTP',
    description:
      'Like request, but an explicit resend inside the 60s cooldown is ' +
      'refused with 429 and a `retryAfterSeconds` hint rather than silently ' +
      'returning the live code.',
  })
  @ApiResponse({ status: 200, description: 'New code issued.' })
  @ApiResponse({ status: 400, description: 'Phone is not a RW/UG mobile.' })
  @ApiResponse({ status: 429, description: 'Still inside the cooldown.' })
  resend(@Body() dto: ResendOtpDto) {
    return this.otpService.resendOtp(dto);
  }
}
