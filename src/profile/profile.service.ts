import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  SUPPORTED_COUNTRIES,
  SUPPORTED_LOCALES,
  UpdateProfileDto,
} from './dto/update-profile.dto';
import { RequestContactCodeDto } from './dto/request-contact-code.dto';
import { VerifyContactChangeDto } from './dto/verify-contact-change.dto';

const CODE_TTL_MS = 24 * 60 * 60 * 1000; // same TTL as the auth email-verification flow

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        country: true,
        locale: true,
        isVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      ...user,
      // Mobile contract: avatarUrl optional — null until avatars exist.
      avatarUrl: null,
    };
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Service-level whitelist (defence in depth — DTO already validates).
    if (dto.country !== undefined && !SUPPORTED_COUNTRIES.includes(dto.country)) {
      throw new BadRequestException(
        `country must be one of: ${SUPPORTED_COUNTRIES.join(', ')}`,
      );
    }
    if (dto.locale !== undefined && !SUPPORTED_LOCALES.includes(dto.locale)) {
      throw new BadRequestException(
        `locale must be one of: ${SUPPORTED_LOCALES.join(', ')}`,
      );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.locale !== undefined && { locale: dto.locale }),
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        country: true,
        locale: true,
        isVerified: true,
        createdAt: true,
      },
    });
  }

  /** Step 1 of a contact change: issue an OTP-style code for the NEW contact. */
  async requestContactCode(userId: string, dto: RequestContactCodeDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const code = randomInt(10000, 99999).toString();
    const verificationCodeExpiry = new Date(Date.now() + CODE_TTL_MS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { verificationCode: code, verificationCodeExpiry },
    });

    if (dto.email) {
      // Reuse the auth email-verification channel (same code store).
      await this.notificationsService.sendVerificationEmail(dto.email, code);
    } else if (dto.phone) {
      // D7 (OTP delivery): no SMS gateway in main yet — dev-log the code.
      // Swap for an SMS provider call when D7 lands.
      this.logger.log(
        `[DEV-LOG] Contact-change code for ${user.email} (new phone ${dto.phone}): ${code}`,
      );
    }

    return { message: 'Verification code sent', expiresInMinutes: CODE_TTL_MS / 60000 };
  }

  /** Step 2: verify the code and apply the contact change. */
  async verifyContactChange(userId: string, dto: VerifyContactChangeDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, verificationCode: true, verificationCodeExpiry: true },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.verificationCode || user.verificationCode !== dto.code) {
      throw new BadRequestException('Invalid verification code');
    }
    if (
      user.verificationCodeExpiry &&
      user.verificationCodeExpiry < new Date()
    ) {
      throw new BadRequestException(
        'Verification code expired. Please request a new one.',
      );
    }

    // Email uniqueness is enforced by the DB unique index — surface as 409.
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email is already in use by another account');
      }
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          // Codes are single-use.
          verificationCode: null,
          verificationCodeExpiry: null,
        },
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          role: true,
          country: true,
          locale: true,
          isVerified: true,
          createdAt: true,
        },
      });
      return { ...updated, avatarUrl: null };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Email is already in use by another account');
      }
      throw error;
    }
  }
}
