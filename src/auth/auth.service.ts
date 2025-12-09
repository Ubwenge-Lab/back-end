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
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PatientsService } from '../patients/patients.service';
import { PharmaciesService } from '../pharmacies/pharmacies.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LoginDto, RegisterPatientDto, RegisterPharmacyDto } from './dto';

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

    if (!user.isVerified && user.role === 'PATIENT') {
      throw new UnauthorizedException('Please verify your email first');
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // Update refresh token
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    // Get user profile
    let profile = null;
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

    // Generate verification token
    const verificationToken = Math.random().toString(36).substring(2, 15);

    // Create user and patient
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        role: 'PATIENT',
        verificationToken,
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

    // Send verification email (via NotificationsService)
    await this.notificationsService.sendVerificationEmail(
      user.email,
      verificationToken,
    );

    return {
      message: 'Registration successful! Please check your email to verify your account.',
      userId: user.id,
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
    await this.notificationsService.notifySuperAdminsNewPharmacy(
      user.pharmacy.id,
      user.pharmacy.name,
    );

    return {
      message: 'Registration submitted! Your pharmacy will be reviewed by our admin team.',
      userId: user.id,
    };
  }

  // ========================================
  // VERIFY EMAIL
  // ========================================

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: { verificationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification token');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null,
      },
    });

    return { message: 'Email verified successfully! You can now login.' };
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
