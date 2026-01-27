// backend/src/auth/auth.service.ts

import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PatientsService } from '../patients/patients.service';
import { PharmaciesService } from '../pharmacies/pharmacies.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LoginDto, RegisterPatientDto, RegisterPharmacyDto, VerifyEmailDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private usersService: UsersService,
    private patientsService: PatientsService,
    private pharmaciesService: PharmaciesService,
    private notificationsService: NotificationsService,
  ) {}

  // ========================================
  // LOGIN
  // ========================================

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check email verification (except for PHARMACY and SUPER_ADMIN)
    if (!user.isVerified && user.role === 'PATIENT') {
      throw new UnauthorizedException(
        'Please verify your email first. Check your inbox for the verification code.'
      );
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // Update refresh token
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    // Get user profile
    let profile: any = null;
    if (user.role === 'PATIENT') {
      profile = await this.patientsService.findByUserId(user.id);
    } else if (user.role === 'PHARMACY') {
      profile = await this.pharmaciesService.findByUserId(user.id);
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        profile,
      },
      ...tokens,
    };
  }

  // ========================================
  // REGISTER PATIENT
  // ========================================

  async registerPatient(dto: RegisterPatientDto) {
    // Check if email exists
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Generate 5-digit verification code
    const verificationCode = this.generateVerificationCode();
    const verificationCodeExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user and patient
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        role: 'PATIENT',
        verificationCode,
        verificationCodeExpiry,
        isVerified: false,
        patient: {
          create: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone,
            dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
            gender: dto.gender,
            address: dto.address,
            insuranceProvider: dto.insuranceProvider,
            insurancePolicy: dto.insurancePolicy,
          },
        },
      },
      include: { patient: true },
    });

    // Send verification email (FIXED - only 2 parameters)
    try {
      await this.notificationsService.sendVerificationEmail(
        user.email,
        verificationCode,
      );
      console.log(`✅ Verification code sent to ${user.email}: ${verificationCode}`);
    } catch (error) {
      console.error('❌ Failed to send verification email:', error);
      // In development, log the code for testing
      if (this.configService.get('NODE_ENV') === 'development') {
        console.log(`🔑 VERIFICATION CODE FOR ${user.email}: ${verificationCode}`);
      }
    }

    return {
      message: 'Registration successful! Please check your email for the verification code.',
      userId: user.id,
      email: user.email,
      // Only include code in development
      ...(this.configService.get('NODE_ENV') === 'development' && { 
        verificationCode 
      }),
    };
  }

  // ========================================
  // REGISTER PHARMACY
  // ========================================

  async registerPharmacy(dto: RegisterPharmacyDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        role: 'PHARMACY',
        isVerified: true, // Pharmacy verifies via super admin, not email
        pharmacy: {
          create: {
            name: dto.name,
            phone: dto.phone,
            address: dto.address,
            latitude: dto.latitude,
            longitude: dto.longitude,
            licenseNumber: dto.licenseNumber,
            licenseDocument: dto.licenseDocument,
            status: 'PENDING',
          },
        },
      },
      include: { pharmacy: true },
    });

    // Notify super admins
    if (!user.pharmacy) {
      throw new BadRequestException('Pharmacy profile not created');
    }
    
    try {
      await this.notificationsService.notifySuperAdminsNewPharmacy(
        user.pharmacy.id,
        user.pharmacy.name,
      );
    } catch (error) {
      console.error('Failed to notify super admins:', error);
    }

    return {
      message: 'Registration submitted! Your pharmacy will be reviewed by our admin team.',
      userId: user.id,
    };
  }

  // ========================================
  // VERIFY EMAIL WITH 5-DIGIT CODE
  // ========================================

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.prisma.user.findFirst({
      where: { 
        email: dto.email,
        verificationCode: dto.code,
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification code or email');
    }

    // Check if code is expired
    if (user.verificationCodeExpiry && user.verificationCodeExpiry < new Date()) {
      throw new BadRequestException('Verification code has expired. Please request a new one.');
    }

    // Verify user
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationCode: null,
        verificationCodeExpiry: null,
      },
    });

    return { 
      message: 'Email verified successfully! You can now login.',
      verified: true,
    };
  }

  // ========================================
  // RESEND VERIFICATION CODE
  // ========================================

  async resendVerificationCode(email: string) {
    const user = await this.usersService.findByEmail(email);
    
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email already verified');
    }

    // Generate new code
    const verificationCode = this.generateVerificationCode();
    const verificationCodeExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Update user with new code
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationCode,
        verificationCodeExpiry,
      },
    });

    // Send new code (FIXED - only 2 parameters)
    try {
      await this.notificationsService.sendVerificationEmail(
        user.email,
        verificationCode,
      );
      console.log(`✅ New verification code sent to ${user.email}: ${verificationCode}`);
    } catch (error) {
      console.error('❌ Failed to send verification email:', error);
      if (this.configService.get('NODE_ENV') === 'development') {
        console.log(`🔑 VERIFICATION CODE FOR ${user.email}: ${verificationCode}`);
      }
    }

    return {
      message: 'New verification code sent to your email',
      // Only include code in development
      ...(this.configService.get('NODE_ENV') === 'development' && { 
        verificationCode 
      }),
    };
  }

  // ========================================
  // REFRESH TOKEN
  // ========================================

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Access denied');
    }

    const isRefreshTokenValid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Access denied');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  // ========================================
  // LOGOUT
  // ========================================

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    return { message: 'Logged out successfully' };
  }

  // ========================================
  // SUPER ADMIN LOGIN
  // ========================================

  async superAdminLogin(secretKey: string) {
    const validSecretKey = this.configService.get('SUPER_ADMIN_SECRET_KEY');
    if (secretKey !== validSecretKey) {
      throw new UnauthorizedException('Invalid secret key');
    }

    // Get super admin user
    const superAdmin = await this.prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
    });

    if (!superAdmin) {
      throw new UnauthorizedException('Super admin not found');
    }

    const tokens = await this.generateTokens(
      superAdmin.id,
      superAdmin.email,
      superAdmin.role,
    );

    await this.updateRefreshToken(superAdmin.id, tokens.refreshToken);

    return {
      user: {
        id: superAdmin.id,
        email: superAdmin.email,
        role: superAdmin.role,
      },
      ...tokens,
    };
  }

  // ========================================
  // HELPER FUNCTIONS
  // ========================================

  private generateVerificationCode(): string {
    // Generate a 5-digit code
    return Math.floor(10000 + Math.random() * 90000).toString();
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_EXPIRATION'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedRefreshToken },
    });
  }
}