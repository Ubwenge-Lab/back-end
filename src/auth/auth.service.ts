// backend/src/auth/auth.service.ts

import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PatientsService } from '../patients/patients.service';
import { PharmaciesService } from '../pharmacies/pharmacies.service';
import { NotificationsService } from '../notifications/notifications.service';
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
import { randomInt, randomBytes } from 'crypto';

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
  // LOGIN (For ALL users including SUPER_ADMIN)
  // ========================================

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isActive === false) {
      throw new UnauthorizedException('Your account has been deactivated. Please contact support.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check email verification for PATIENT PHARMACY and HOSPITAL_ADMIN
    if (
      !user.isVerified &&
      (user.role === 'PATIENT' || user.role === 'PHARMACY' || user.role === 'HOSPITAL_ADMIN')
    ) {
      throw new UnauthorizedException(
        'Please verify your email first. Check your inbox for the verification code.',
      );
    }

    // For SUPER_ADMIN: Check if this is first login (default password)
    if (user.role === 'SUPER_ADMIN') {
      const isDefaultPassword = await bcrypt.compare(
        process.env.SUPER_ADMIN_PASSWORD || 'SuperAdminPower@2025',
        user.password,
      );

      const tokens = await this.generateTokens(user.id, user.email, user.role);
      await this.updateRefreshToken(user.id, tokens.refreshToken);

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
          requiresPasswordChange: isDefaultPassword,
        },
        ...tokens,
        message: isDefaultPassword
          ? 'Please change your password for security purposes.'
          : null,
      };
    }

    // Check pharmacy approval status
    if (user.role === 'PHARMACY') {
      const pharmacy = await this.pharmaciesService.findByUserId(user.id);

      if (!pharmacy) {
        throw new UnauthorizedException('Pharmacy profile not found');
      }

      const tokens = await this.generateTokens(
        user.id,
        user.email,
        user.role,
        pharmacy.status,
      );
      await this.updateRefreshToken(user.id, tokens.refreshToken);

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
          profile: pharmacy,
          pharmacyStatus: pharmacy.status,
          rejectionReason: pharmacy.rejectionReason || null,
        },
        ...tokens,
        message:
          pharmacy.status === 'PENDING'
            ? 'Your account is under review. Please wait for approval.'
            : pharmacy.status === 'REJECTED'
              ? 'Your account was rejected. Please update your documents and resubmit.'
              : null,
      };
    }

    if (user.role === 'HOSPITAL_ADMIN') {
      const hospital = await this.prisma.hospital.findUnique({
        where: { userId: user.id },
      });

      if (!hospital) {
        throw new UnauthorizedException('Hospital profile not found');
      }

      const tokens = await this.generateTokens(
        user.id,
        user.email,
        user.role,
        hospital.status,
        hospital.id,
      );
      await this.updateRefreshToken(user.id, tokens.refreshToken);

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
          hospitalId: hospital.id,
          profile: hospital,
          hospitalStatus: hospital.status,
        },
        ...tokens,
        message:
          hospital.status === 'PENDING'
            ? 'Your account is under review. Please wait for approval.'
            : hospital.status === 'REJECTED'
              ? 'Your account was rejected. Please update your documents and resubmit.'
              : null,
      };
    }

    // BRANCH_MANAGER login
    if (user.role === 'BRANCH_MANAGER') {
      const branch = await this.prisma.branch.findFirst({
        where: { managerId: user.id },
        include: { pharmacy: { select: { name: true } } },
      });

      if (!branch) throw new UnauthorizedException('Branch not found');

      const isUsingTempPassword =
        branch.tempPasswordHash &&
        (await bcrypt.compare(dto.password, branch.tempPasswordHash));

      if (isUsingTempPassword) {
        if (
          branch.tempPasswordExpiry &&
          branch.tempPasswordExpiry < new Date()
        ) {
          throw new ForbiddenException(
            'Temporary password expired. Contact HQ to resend credentials.',
          );
        }
      }

      const tokens = await this.generateTokens(
        user.id,
        user.email,
        user.role,
        branch.branchStatus,
      );
      await this.updateRefreshToken(user.id, tokens.refreshToken);

      return {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          branchId: branch.id,
          branchName: branch.name,
          pharmacyName: branch.pharmacy.name,
          branchStatus: branch.branchStatus,
          requiresPasswordChange: !!isUsingTempPassword,
        },
        ...tokens,
      };
    }

    // ========================================
    // STAFF LOGIN (PHARMACIST, CASHIER, NURSE, DOCTOR, RECEPTIONIST)
    // ========================================
    if (['PHARMACIST', 'CASHIER', 'NURSE', 'DOCTOR', 'RECEPTIONIST'].includes(user.role)) {
      // Check for regular staff (Pharmacy Branch)
      let staff = await this.prisma.staff.findFirst({
        where: { userId: user.id },
        include: {
          branch: {
            include: {
              pharmacy: { select: { name: true } },
            },
          },
          permissions: true,
        },
      });

      if (staff) {
        if (staff.status !== 'ACTIVE') {
          throw new UnauthorizedException(
            'Your account has been deactivated. Please contact your branch manager.',
          );
        }

        if (staff.branch.branchStatus !== 'APPROVED') {
          throw new UnauthorizedException(
            'Branch is not yet approved. Please wait for approval.',
          );
        }

        const isUsingTempPassword =
          staff.tempPasswordHash &&
          (await bcrypt.compare(dto.password, staff.tempPasswordHash));

        if (isUsingTempPassword) {
          if (staff.tempPasswordExpiry && staff.tempPasswordExpiry < new Date()) {
            throw new ForbiddenException(
              'Temporary password expired. Contact your branch manager to resend credentials.',
            );
          }
        }

        const tokens = await this.generateTokens(user.id, user.email, user.role);
        await this.updateRefreshToken(user.id, tokens.refreshToken);

        return {
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            branchId: staff.branchId,
            branchName: staff.branch.name,
            pharmacyName: staff.branch.pharmacy.name,
            status: staff.status,
            permissions: staff.permissions?.permissions || [],
            requiresPasswordChange: !!isUsingTempPassword,
          },
          ...tokens,
          message: isUsingTempPassword
            ? 'Please change your password for security purposes.'
            : null,
        };
      }

      // Check for hospital staff
      const hospitalStaff = await this.prisma.hospitalStaff.findFirst({
        where: { userId: user.id },
        include: { hospital: true },
      });

      if (hospitalStaff) {
        if (hospitalStaff.status !== 'ACTIVE') {
          throw new UnauthorizedException('Your account has been deactivated.');
        }

        const isUsingTempPassword =
          hospitalStaff.tempPasswordHash &&
          (await bcrypt.compare(dto.password, hospitalStaff.tempPasswordHash));

        if (isUsingTempPassword) {
          if (hospitalStaff.tempPasswordExpiry && hospitalStaff.tempPasswordExpiry < new Date()) {
            throw new ForbiddenException('Temporary password expired.');
          }
        }

        const tokens = await this.generateTokens(
          user.id,
          user.email,
          user.role,
          undefined,
          hospitalStaff.hospitalId,
        );
        await this.updateRefreshToken(user.id, tokens.refreshToken);

        return {
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            hospitalId: hospitalStaff.hospitalId,
            hospitalName: hospitalStaff.hospital.name,
            status: hospitalStaff.status,
            requiresPasswordChange: !!isUsingTempPassword,
          },
          ...tokens,
        };
      }

      throw new UnauthorizedException('Staff profile not found');
    }

    // Generate tokens for PATIENT
    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    let profile: any = null;
    if (user.role === 'PATIENT') {
      profile = await this.patientsService.findByUserId(user.id);
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
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const verificationCode = this.generateVerificationCode();
    const verificationCodeExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

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
            lastLat: dto.latitude,
            lastLng: dto.longitude,
          },
        },
      },
      include: { patient: true },
    });

    try {
      await this.notificationsService.sendVerificationEmail(
        user.email,
        verificationCode,
      );
    } catch (error) {
      console.error('❌ Failed to send verification email:', error);
    }

    return {
      message: 'Registration successful! Please check your email for the verification code.',
      userId: user.id,
      email: user.email,
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

    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const verificationCode = this.generateVerificationCode();
    const verificationCodeExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        role: 'PHARMACY',
        verificationCode,
        verificationCodeExpiry,
        isVerified: false,
        pharmacy: {
          create: {
            name: dto.pharmacyName,
            representativeName: dto.representativeName,
            phone: dto.phone,
            address: dto.address,
            latitude: dto.latitude,
            longitude: dto.longitude,
            dateOfIncorporation: new Date(dto.dateOfIncorporation),
            rdbCertificate: dto.rdbCertificate,
            pharmacyLicense: dto.pharmacyLicense,
            businessRegistration: dto.businessRegistration,
            status: 'PENDING',
          },
        },
      },
      include: { pharmacy: true },
    });

    try {
      await this.notificationsService.sendVerificationEmail(
        user.email,
        verificationCode,
      );
    } catch (error) {
      console.error('❌ Failed to send verification email:', error);
    }

    return {
      message: 'Registration successful! Please verify your email, then wait for admin approval.',
      userId: user.id,
      pharmacyId: user.pharmacy.id,
      status: 'PENDING',
    };
  }

  // ========================================
  // REGISTER HOSPITAL
  // ========================================

  async registerHospital(dto: RegisterHospitalDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const verificationCode = this.generateVerificationCode();
    const verificationCodeExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        role: 'HOSPITAL_ADMIN',
        verificationCode,
        verificationCodeExpiry,
        isVerified: false,
        hospital: {
          create: {
            name: dto.hospitalName,
            representativeName: dto.representativeName,
            phone: dto.phone,
            address: dto.address,
            latitude: dto.latitude,
            longitude: dto.longitude,
            dateOfIncorporation: dto.dateOfIncorporation ? new Date(dto.dateOfIncorporation) : null,
            rdbCertificate: dto.rdbCertificate,
            pharmacyLicense: dto.pharmacyLicense,
            businessRegistration: dto.businessRegistration,
            status: 'PENDING',
          },
        },
      },
      include: { hospital: true },
    });

    try {
      await this.notificationsService.sendVerificationEmail(
        user.email,
        verificationCode,
      );
      console.log(`✅ Hospital verification code sent to ${user.email}: ${verificationCode}`);
    } catch (error) {
      console.error('❌ Failed to send verification email:', error);
    }

    return {
      message: 'Registration successful! Please verify your email, then wait for admin approval.',
      userId: user.id,
      hospitalId: user.hospital.id,
      status: 'PENDING',
    };
  }

  // ========================================
  // ONBOARD HOSPITAL STAFF
  // ========================================

  async onboardHospitalStaff(
    hospitalAdminUserId: string,
    dto: OnboardHospitalStaffDto,
  ) {
    const hospital = await this.prisma.hospital.findFirst({
      where: { userId: hospitalAdminUserId },
    });

    if (!hospital) {
      throw new ForbiddenException('Only hospital admins can onboard staff');
    }

    if (dto.role === 'DOCTOR') {
      if (!dto.specialization || !dto.licenseNumber) {
        throw new BadRequestException(
          'specialization and licenseNumber are required when onboarding a Doctor',
        );
      }
      const existingLicense = await this.prisma.doctor.findUnique({
        where: { licenseNumber: dto.licenseNumber },
      });
      if (existingLicense) {
        throw new ConflictException('License number already registered');
      }
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    const tempPasswordExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          role: dto.role as any,
          isVerified: true,
        },
      });

      await tx.hospitalStaff.create({
        data: {
          userId: user.id,
          hospitalId: hospital.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          status: 'ACTIVE',
          tempPasswordHash: hashedPassword,
          tempPasswordExpiry,
        },
      });

      if (dto.role === 'DOCTOR') {
        await tx.doctor.create({
          data: {
            userId: user.id,
            hospitalId: hospital.id,
            specialization: dto.specialization!,
            licenseNumber: dto.licenseNumber!,
            bio: dto.bio,
          },
        });
      }

      return { user };
    });

    try {
      await this.notificationsService.sendHospitalStaffCredentials(
        dto.email,
        tempPassword,
        hospital.name,
        dto.role,
      );
    } catch (error) {
      console.error('❌ Failed to send hospital staff credentials email:', error);
    }

    return {
      message: `${dto.role === 'DOCTOR' ? 'Doctor' : 'Staff member'} onboarded successfully.`,
      userId: result.user.id,
    };
  }

  // ========================================
  // ACTIVATE HOSPITAL STAFF (no token required — called from email link)
  // ========================================

  async activateHospitalStaff(dto: ActivateHospitalStaffDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new BadRequestException('Invalid email or temporary password');
    }

    const isTempPasswordValid = await bcrypt.compare(dto.tempPassword, user.password);
    if (!isTempPasswordValid) {
      throw new BadRequestException('Invalid email or temporary password');
    }

    const hospitalStaff = await this.prisma.hospitalStaff.findFirst({
      where: { userId: user.id },
    });

    if (!hospitalStaff || !hospitalStaff.tempPasswordHash) {
      throw new BadRequestException('No pending activation found for this account');
    }

    if (hospitalStaff.tempPasswordExpiry && hospitalStaff.tempPasswordExpiry < new Date()) {
      throw new ForbiddenException(
        'Temporary password has expired. Contact your hospital admin to resend your credentials.',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, refreshToken: null },
      }),
      this.prisma.hospitalStaff.update({
        where: { id: hospitalStaff.id },
        data: { tempPasswordHash: null, tempPasswordExpiry: null },
      }),
    ]);

    return {
      message: 'Password set successfully. You can now log in with your new password.',
    };
  }

  // ========================================
  // VERIFY EMAIL
  // ========================================

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
        verificationCode: dto.code,
      },
      include: { hospital: true, pharmacy: true },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification code or email');
    }

    if (user.verificationCodeExpiry && user.verificationCodeExpiry < new Date()) {
      throw new BadRequestException('Verification code has expired.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationCode: null,
        verificationCodeExpiry: null,
      },
    });

    if (user.role === 'PHARMACY' && user.pharmacy) {
      await this.notificationsService.notifySuperAdminsNewPharmacy(
        user.pharmacy.id,
        user.pharmacy.name,
      );
    }

    if (user.role === 'HOSPITAL_ADMIN' && user.hospital) {
      try {
        await this.notificationsService.notifySuperAdminsNewHospital(
          user.hospital.id,
          user.hospital.name,
        );
      } catch (error) {
        console.error('❌ Failed to notify super admins:', error);
      }
    }

    return {
      message: user.role === 'PHARMACY'
        ? 'Email verified! Your pharmacy will be reviewed by our admin team.'
        : 'Email verified successfully! You can now login.',
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

    const verificationCode = this.generateVerificationCode();
    const verificationCodeExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationCode,
        verificationCodeExpiry,
      },
    });

    try {
      await this.notificationsService.sendVerificationEmail(
        user.email,
        verificationCode,
      );
    } catch (error) {
      console.error('❌ Failed to send verification email:', error);
    }

    return { message: 'New verification code sent to your email' };
  }

  // ========================================
  // FORGOT PASSWORD
  // ========================================

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      return { message: 'If your email is registered, you will receive a password reset code.' };
    }

    const resetCode = this.generateResetCode();
    const resetCodeExpiry = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationCode: resetCode,
        verificationCodeExpiry: resetCodeExpiry,
      },
    });

    try {
      await this.notificationsService.sendPasswordResetEmail(user.email, resetCode);
    } catch (error) {
      console.error('❌ Failed to send reset email:', error);
    }

    return { message: 'If your email is registered, you will receive a password reset code.' };
  }

  // ========================================
  // RESET PASSWORD
  // ========================================

  async resetPassword(dto: ResetPasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
        verificationCode: dto.resetCode,
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid reset code or email');
    }

    if (user.verificationCodeExpiry && user.verificationCodeExpiry < new Date()) {
      throw new BadRequestException('Reset code has expired.');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        verificationCode: null,
        verificationCodeExpiry: null,
        refreshToken: null,
      },
    });

    return { message: 'Password reset successfully!' };
  }

  // ========================================
  // CHANGE PASSWORD (Authenticated)
  // ========================================

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword, refreshToken: null },
    });

    // Clear temp password if this user is hospital staff
    const hospitalStaff = await this.prisma.hospitalStaff.findFirst({
      where: { userId },
      select: { id: true, tempPasswordHash: true },
    });
    if (hospitalStaff?.tempPasswordHash) {
      await this.prisma.hospitalStaff.update({
        where: { id: hospitalStaff.id },
        data: { tempPasswordHash: null, tempPasswordExpiry: null },
      });
    }

    return { message: 'Password changed successfully!' };
  }

  async changeBranchPassword(userId: string, dto: ChangeBranchPasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { managerId: userId },
    });

    if (!branch) throw new BadRequestException('Branch not found');

    const isValid = await bcrypt.compare(dto.tempPassword, branch.tempPasswordHash);
    if (!isValid) throw new BadRequestException('Invalid temporary password');

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      }),
      this.prisma.branch.update({
        where: { id: branch.id },
        data: { tempPasswordHash: null, tempPasswordExpiry: null },
      }),
    ]);

    return { message: 'Password changed successfully' };
  }

  async uploadBranchLicense(userId: string, licenseUrl: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { managerId: userId },
    });

    if (!branch) throw new BadRequestException('Branch not found');

    await this.prisma.branch.update({
      where: { id: branch.id },
      data: { pharmacyLicense: licenseUrl, branchStatus: 'PENDING' },
    });

    return { message: 'License uploaded. Awaiting admin approval.' };
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

    const hospitalId = await this.getHospitalIdForUser(user.id, user.role);
    const tokens = await this.generateTokens(user.id, user.email, user.role, undefined, hospitalId);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  private async getHospitalIdForUser(userId: string, role: string): Promise<string | undefined> {
    if (role === 'HOSPITAL_ADMIN') {
      const hospital = await this.prisma.hospital.findUnique({
        where: { userId },
        select: { id: true },
      });
      return hospital?.id;
    }
    if (['DOCTOR', 'NURSE', 'RECEPTIONIST'].includes(role)) {
      const hospitalStaff = await this.prisma.hospitalStaff.findFirst({
        where: { userId },
        select: { hospitalId: true },
      });
      if (hospitalStaff) return hospitalStaff.hospitalId;
      if (role === 'DOCTOR') {
        const doctor = await this.prisma.doctor.findUnique({
          where: { userId },
          select: { hospitalId: true },
        });
        return doctor?.hospitalId;
      }
    }
    return undefined;
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
  // HELPERS
  // ========================================

  private generateVerificationCode(): string {
    return randomInt(10000, 99999).toString();
  }

  private generateResetCode(): string {
    return randomInt(100000, 999999).toString();
  }

  // Produces a 12-char password: Ev + 8 base64url chars + 1!
  // Always contains uppercase, lowercase, digit, and special character.
  private generateTempPassword(): string {
    return `Ev${randomBytes(6).toString('base64url')}1!`;
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    status?: string,
    hospitalId?: string,
  ) {
    const payload: Record<string, any> = { sub: userId, email, role };
    if (status !== undefined) payload.status = status;
    if (hospitalId) payload.hospitalId = hospitalId;
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
