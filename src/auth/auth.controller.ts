// backend/src/auth/auth.controller.ts

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Put,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterPatientDto,
  RegisterPharmacyDto,
  VerifyEmailDto,
  ResendVerificationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  ChangeBranchPasswordDto,
  UploadBranchLicenseDto,
  RegisterHospitalDto,
  OnboardHospitalStaffDto,
  ActivateHospitalStaffDto,
} from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

// IMPORTS FOR SECURITY THROTTLING
  import { Throttle, SkipThrottle } from '@nestjs/throttler';

@ApiTags('Authentication')
@Controller('auth')
@Throttle({ default: { limit: 5, ttl: 60000 } }) // Limit to 5 requests per 1 minute for all routes in this controller
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login (Patient/Pharmacy/Super Admin)' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register/patient')
  @ApiOperation({ summary: 'Register as Patient' })
  registerPatient(@Body() dto: RegisterPatientDto) {
    return this.authService.registerPatient(dto);
  }

  @Post('register/pharmacy')
  @ApiOperation({ summary: 'Register as Pharmacy' })
  registerPharmacy(@Body() dto: RegisterPharmacyDto) {
    return this.authService.registerPharmacy(dto);
  }

  @Post('register/hospital')
  @ApiOperation({ summary: 'Register as Hospital Admin' })
  registerHospital(@Body() dto: RegisterHospitalDto) {
    return this.authService.registerHospital(dto);
  }

  @Post('onboard/hospital-staff')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Onboard Hospital Staff (Doctor/Nurse/Receptionist)',
  })
  onboardHospitalStaff(@Req() req: any, @Body() dto: OnboardHospitalStaffDto) {
    return this.authService.onboardHospitalStaff(req.user.sub, dto);
  }

  @Post('hospital-staff/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set permanent password from email link (no login required)' })
  activateHospitalStaff(@Body() dto: ActivateHospitalStaffDto) {
    return this.authService.activateHospitalStaff(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with 5-digit code' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend verification code' })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerificationCode(dto.email);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset code' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with code' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Put('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (authenticated users)' })
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.sub, dto);
  }

  @Post('refresh')
  @SkipThrottle() // Skip rate limiting for active tokens. Refresh tokens should be long-lived and not abused, so we allow more leniency here.
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh access token' })
  refreshTokens(@Req() req: any) {
    return this.authService.refreshTokens(req.user.sub, req.user.refreshToken);
  }

  @Post('logout')
  @SkipThrottle() // Skip rate limiting for logout to ensure users can always log out even if they hit limits on other routes
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout' })
  logout(@Req() req: any) {
    return this.authService.logout(req.user.sub);
  }

  @Put('branch/change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change branch manager password (temp -> permanent)',
  })
  changeBranchPassword(@Req() req: any, @Body() dto: ChangeBranchPasswordDto) {
    return this.authService.changeBranchPassword(req.user.sub, dto);
  }

  @Put('branch/upload-license')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload pharmacy license for branch approval' })
  uploadBranchLicense(@Req() req: any, @Body() dto: UploadBranchLicenseDto) {
    return this.authService.uploadBranchLicense(
      req.user.sub,
      dto.pharmacyLicense,
    );
  }
}
