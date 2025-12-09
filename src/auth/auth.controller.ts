// backend/src/auth/auth.controller.ts

import {
  Controller,
  Post,
  Body,
  Get,
  Query,
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

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email with token' })
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
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