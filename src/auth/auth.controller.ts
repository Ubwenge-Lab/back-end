// backend/src/auth/auth.controller.ts

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterPatientDto,
  RegisterPharmacyDto,
  SuperAdminLoginDto,
  VerifyEmailDto,
  ResendVerificationDto,
} from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login (Patient/Pharmacy)' })
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

  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh access token' })
  refreshTokens(@Req() req: any) {
    return this.authService.refreshTokens(req.user.sub, req.user.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout' })
  logout(@Req() req: any) {
    return this.authService.logout(req.user.sub);
  }

  @Post('super-admin/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Super Admin Login' })
  superAdminLogin(@Body() dto: SuperAdminLoginDto) {
    return this.authService.superAdminLogin(dto.secretKey);
  }
}