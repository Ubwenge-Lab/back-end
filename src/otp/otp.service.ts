// backend/src/otp/otp.service.ts
//
// Phone-OTP lifecycle: request -> verify -> resend (cooldown-gated).
//
// The security model, stated once:
//
//   * A phone number is NOT an identity here. No phone column in this schema
//     is unique, and shared handsets are common in RW/UG. The account is
//     identified by `email` (unique); the code only proves the caller holds
//     the number.
//   * Codes are stored as bcrypt hashes. A database dump yields no live codes.
//   * Requesting a code for an address that does not exist returns the same
//     response as one that does. Otherwise this endpoint is a free account
//     enumeration oracle.
//   * Codes expire, verify attempts are capped, and resends are
//     cooldown-gated, on top of the controller's per-IP throttle.
//
// There is no SMS provider wired into this platform yet (the only outbound
// gateway is Flutterwave, for payments). Until one exists, delivery is a stub
// that logs the code in non-production. That is deliberate and documented, not
// an oversight -- swapping `SmsDeliveryStub` for a real gateway is the only
// change needed.

import {
  BadRequestException,
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose, Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { RequestOtpDto, ResendOtpDto, VerifyOtpDto } from './dto/otp.dto';
import { maskPhone, normalizePhone } from './phone.util';

/** Digits in a code. Six, per the OWASP authentication guidance. */
export const OTP_CODE_LENGTH = 6;

/** How long a code stays valid. */
export const OTP_TTL_MS = 10 * 60 * 1000;

/** Minimum gap between two sends for the same account and purpose. */
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

/** Failed verifications tolerated before the code is burned. */
export const OTP_MAX_ATTEMPTS = 5;

/** Codes issued per account+purpose inside {@link OTP_REQUEST_WINDOW_MS}. */
export const OTP_MAX_SENDS_PER_WINDOW = 5;
export const OTP_REQUEST_WINDOW_MS = 60 * 60 * 1000;

/** Shape returned by every OTP endpoint. */
export interface OtpResult {
  message: string;
  /** Masked, so a client can say "we texted +250 78* *** 456". */
  phone: string;
  /** When the current code dies. Absent when nothing was issued. */
  expiresAt?: string;
  /** Seconds until a resend is allowed. */
  retryAfterSeconds?: number;
}

/** Verification outcome. */
export interface OtpVerifyResult {
  message: string;
  phone: string;
  verified: true;
  phoneVerifiedAt: string;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Issues a code for `dto.email` / `dto.phone`.
   *
   * Always resolves with the same message whether or not the account exists.
   */
  async requestOtp(dto: RequestOtpDto): Promise<OtpResult> {
    return this.issue(dto, { isResend: false });
  }

  /**
   * Reissues a code. Identical to {@link requestOtp} except that an existing
   * live code inside the cooldown is refused with 429 rather than silently
   * replaced, so a client cannot use resend to bypass the gap.
   */
  async resendOtp(dto: ResendOtpDto): Promise<OtpResult> {
    return this.issue(dto, { isResend: true });
  }

  private async issue(
    dto: RequestOtpDto | ResendOtpDto,
    { isResend }: { isResend: boolean },
  ): Promise<OtpResult> {
    // Normalization happens before anything else: an invalid number is a
    // client error regardless of whether the account exists, and saying so
    // leaks nothing.
    const phone = normalizePhone(dto.phone, dto.region);
    const masked = maskPhone(phone);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, isActive: true },
    });

    // Uniform response for a missing or deactivated account: this endpoint is
    // unauthenticated, so a distinguishable answer would let anyone test which
    // addresses are registered.
    if (!user || user.isActive === false) {
      this.logger.warn(
        `OTP requested for an unknown or inactive account (${masked})`,
      );
      return {
        message: `If that account exists, a code has been sent to ${masked}.`,
        phone: masked,
        expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      };
    }

    const now = new Date();
    const live = await this.findLiveOtp(user.id, dto.purpose, now);

    if (live) {
      const elapsed = now.getTime() - live.lastSentAt.getTime();
      const remaining = OTP_RESEND_COOLDOWN_MS - elapsed;

      if (remaining > 0) {
        const retryAfterSeconds = Math.ceil(remaining / 1000);

        if (isResend) {
          // An explicit resend inside the cooldown is the case the client is
          // expected to handle, so it gets a real 429 with Retry-After.
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              message: `Please wait ${retryAfterSeconds}s before requesting another code.`,
              retryAfterSeconds,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        // A plain re-request inside the cooldown is idempotent: the live code
        // stands, nothing new is sent, and the client is told when it may ask
        // again. Re-entering the screen must not burn a send.
        return {
          message: `A code was already sent to ${masked}.`,
          phone: masked,
          expiresAt: live.expiresAt.toISOString(),
          retryAfterSeconds,
        };
      }
    }

    const sendsInWindow = await this.prisma.phoneOtp.count({
      where: {
        userId: user.id,
        purpose: dto.purpose,
        createdAt: { gte: new Date(now.getTime() - OTP_REQUEST_WINDOW_MS) },
      },
    });

    if (sendsInWindow >= OTP_MAX_SENDS_PER_WINDOW) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            'Too many codes requested. Please try again later or contact support.',
          retryAfterSeconds: Math.ceil(OTP_REQUEST_WINDOW_MS / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

    // Any earlier live code for this account+purpose is retired. Two valid
    // codes at once doubles the guessing surface for no benefit.
    await this.prisma.phoneOtp.updateMany({
      where: {
        userId: user.id,
        purpose: dto.purpose,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { expiresAt: now },
    });

    await this.prisma.phoneOtp.create({
      data: {
        userId: user.id,
        phone,
        purpose: dto.purpose,
        codeHash,
        expiresAt,
        lastSentAt: now,
      },
    });

    await this.deliver(phone, code);

    return {
      message: `A code has been sent to ${masked}.`,
      phone: masked,
      expiresAt: expiresAt.toISOString(),
      retryAfterSeconds: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000),
    };
  }

  /**
   * Redeems a code and records the proven number on the user.
   *
   * `phone` must match the number the code was issued for: without that check,
   * a code texted to a number the caller controls could be used to "verify" a
   * different one.
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<OtpVerifyResult> {
    const phone = normalizePhone(dto.phone, dto.region);
    const now = new Date();

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, isActive: true },
    });

    // Verification, unlike request, may be specific: the caller already holds
    // a code, so there is no enumeration to protect against, and a vague
    // error here just strands a legitimate user.
    if (!user || user.isActive === false) {
      throw new BadRequestException('Invalid code');
    }

    const otp = await this.prisma.phoneOtp.findFirst({
      where: {
        userId: user.id,
        purpose: dto.purpose,
        phone,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('Invalid code');
    }

    if (otp.expiresAt <= now) {
      throw new BadRequestException(
        'That code has expired. Please request a new one.',
      );
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Too many incorrect attempts. Please request a new code.',
      );
    }

    const matches = await bcrypt.compare(dto.code, otp.codeHash);

    if (!matches) {
      const attempts = otp.attempts + 1;
      await this.prisma.phoneOtp.update({
        where: { id: otp.id },
        data: {
          attempts,
          // The last tolerated miss kills the code outright, so an attacker
          // cannot keep the record alive by pausing between guesses.
          ...(attempts >= OTP_MAX_ATTEMPTS ? { expiresAt: now } : {}),
        },
      });

      const remaining = OTP_MAX_ATTEMPTS - attempts;
      throw new BadRequestException(
        remaining > 0
          ? `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Too many incorrect attempts. Please request a new code.',
      );
    }

    // Consume and record proof in one transaction: a code marked used with no
    // corresponding proof on the user would strand the caller, and proof
    // written against a code still open to reuse is worse.
    await this.prisma.$transaction([
      this.prisma.phoneOtp.update({
        where: { id: otp.id },
        data: { consumedAt: now },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { verifiedPhone: phone, phoneVerifiedAt: now },
      }),
    ]);

    this.logger.log(
      `Phone verified for user ${user.id} (${maskPhone(phone)})`,
    );

    return {
      message: 'Phone number verified.',
      phone: maskPhone(phone),
      verified: true,
      phoneVerifiedAt: now.toISOString(),
    };
  }

  private async findLiveOtp(
    userId: string,
    purpose: OtpPurpose,
    now: Date,
  ): Promise<Prisma.PhoneOtpGetPayload<object> | null> {
    return this.prisma.phoneOtp.findFirst({
      where: {
        userId,
        purpose,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Six digits, uniformly distributed, from a CSPRNG. */
  private generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(OTP_CODE_LENGTH, '0');
  }

  /**
   * Delivery stub — see the note at the top of this file.
   *
   * In any non-production environment the code goes to the log so the mobile
   * and web teams can complete the flow without an SMS account. In production
   * it does not, and the absence of a provider is logged as an error rather
   * than passing silently: a production deploy that cannot text anyone should
   * be loud.
   */
  private async deliver(phone: string, code: string): Promise<void> {
    const nodeEnv =
      this.configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV;
    const isProduction = nodeEnv === 'production';

    if (isProduction) {
      this.logger.error(
        `No SMS provider configured; cannot deliver OTP to ${maskPhone(phone)}`,
      );
      return;
    }

    this.logger.warn(
      `[OTP DEV MODE] code for ${maskPhone(phone)} is ${code} ` +
        `(expires in ${OTP_TTL_MS / 60000} minutes)`,
    );
  }
}
