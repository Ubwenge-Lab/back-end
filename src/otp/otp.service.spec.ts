// backend/src/otp/otp.service.spec.ts
//
// Service-layer unit tests. Mocked persistence: no real DB (CTO hard rule).

import { Test } from '@nestjs/testing';
import { BadRequestException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import {
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS_PER_WINDOW,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  OtpService,
} from './otp.service';

describe('OtpService', () => {
  let service: OtpService;
  let prisma: any;

  const USER = { id: 'u1', isActive: true };
  const EMAIL = 'patient@example.com';
  const PHONE = '+250788123456';

  /** A live, unconsumed code issued `sentMsAgo` milliseconds back. */
  function liveOtp(overrides: Record<string, unknown> = {}) {
    const now = Date.now();
    return {
      id: 'otp-1',
      userId: USER.id,
      phone: PHONE,
      purpose: OtpPurpose.PHONE_VERIFICATION,
      codeHash: 'hash',
      expiresAt: new Date(now + OTP_TTL_MS),
      attempts: 0,
      consumedAt: null,
      lastSentAt: new Date(now - OTP_RESEND_COOLDOWN_MS - 1000),
      createdAt: new Date(now),
      updatedAt: new Date(now),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(USER),
        update: jest.fn().mockResolvedValue(USER),
      },
      phoneOtp: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) => ({ ...data, id: 'otp-new' })),
        update: jest.fn().mockResolvedValue(liveOtp()),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test') },
        },
      ],
    }).compile();

    service = moduleRef.get(OtpService);
  });

  const base = {
    email: EMAIL,
    phone: PHONE,
    purpose: OtpPurpose.PHONE_VERIFICATION,
  };

  // -------------------------------------------------------------------------
  describe('requestOtp', () => {
    it('stores a hashed code, never the code itself', async () => {
      await service.requestOtp({ ...base });

      expect(prisma.phoneOtp.create).toHaveBeenCalledTimes(1);
      const { data } = prisma.phoneOtp.create.mock.calls[0][0];

      expect(data.codeHash).toBeDefined();
      expect(data.codeHash).not.toMatch(/^\d{6}$/);
      // bcrypt output, so a database dump yields no live codes.
      expect(data.codeHash).toMatch(/^\$2[aby]\$/);
    });

    it('issues a 6-digit code', async () => {
      const warn = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      await service.requestOtp({ ...base });

      const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toMatch(/\bis \d{6}\b/);
    });

    it('normalizes a national number before storing it', async () => {
      await service.requestOtp({ ...base, phone: '0788123456', region: 'RW' });

      const { data } = prisma.phoneOtp.create.mock.calls[0][0];
      expect(data.phone).toBe('+250788123456');
    });

    it('normalizes a Ugandan national number', async () => {
      await service.requestOtp({ ...base, phone: '0772123456', region: 'UG' });

      const { data } = prisma.phoneOtp.create.mock.calls[0][0];
      expect(data.phone).toBe('+256772123456');
    });

    it('rejects a number outside RW/UG before touching the database', async () => {
      await expect(
        service.requestOtp({ ...base, phone: '+254712345678' }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.phoneOtp.create).not.toHaveBeenCalled();
    });

    it('retires any earlier live code for the same account and purpose', async () => {
      await service.requestOtp({ ...base });

      // Two valid codes at once would double the guessing surface.
      expect(prisma.phoneOtp.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: USER.id,
            purpose: OtpPurpose.PHONE_VERIFICATION,
            consumedAt: null,
          }),
        }),
      );
    });

    it('sets an expiry ten minutes out', async () => {
      const before = Date.now();
      await service.requestOtp({ ...base });
      const { data } = prisma.phoneOtp.create.mock.calls[0][0];

      const ttl = data.expiresAt.getTime() - before;
      expect(ttl).toBeGreaterThan(OTP_TTL_MS - 5000);
      expect(ttl).toBeLessThanOrEqual(OTP_TTL_MS + 5000);
    });

    it('does not reveal whether an account exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const missing = await service.requestOtp({ ...base });

      prisma.user.findUnique.mockResolvedValue(USER);
      const present = await service.requestOtp({ ...base });

      // Same shape, same masked phone: this endpoint is unauthenticated, so a
      // distinguishable answer is an account-enumeration oracle.
      expect(missing.phone).toBe(present.phone);
      expect(Object.keys(missing).sort()).toEqual(
        expect.arrayContaining(['message', 'phone', 'expiresAt']),
      );
      expect(missing.message).toMatch(/if that account exists/i);
    });

    it('sends nothing for an unknown account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await service.requestOtp({ ...base });

      expect(prisma.phoneOtp.create).not.toHaveBeenCalled();
    });

    it('treats a deactivated account like a missing one', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isActive: false });

      await service.requestOtp({ ...base });

      expect(prisma.phoneOtp.create).not.toHaveBeenCalled();
    });

    it('is idempotent inside the cooldown - no second SMS', async () => {
      prisma.phoneOtp.findFirst.mockResolvedValue(
        liveOtp({ lastSentAt: new Date(Date.now() - 5000) }),
      );

      const result = await service.requestOtp({ ...base });

      // Re-entering the OTP screen must not burn a send.
      expect(prisma.phoneOtp.create).not.toHaveBeenCalled();
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(
        OTP_RESEND_COOLDOWN_MS / 1000,
      );
      expect(result.message).toMatch(/already sent/i);
    });

    it('issues a fresh code once the cooldown has passed', async () => {
      prisma.phoneOtp.findFirst.mockResolvedValue(
        liveOtp({
          lastSentAt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS - 1),
        }),
      );

      await service.requestOtp({ ...base });

      expect(prisma.phoneOtp.create).toHaveBeenCalledTimes(1);
    });

    it('refuses once the hourly send quota is spent', async () => {
      prisma.phoneOtp.count.mockResolvedValue(OTP_MAX_SENDS_PER_WINDOW);

      await expect(service.requestOtp({ ...base })).rejects.toThrow(
        HttpException,
      );
      expect(prisma.phoneOtp.create).not.toHaveBeenCalled();
    });

    it('reports 429 with a retry hint when the quota is spent', async () => {
      prisma.phoneOtp.count.mockResolvedValue(OTP_MAX_SENDS_PER_WINDOW);

      await expect(service.requestOtp({ ...base })).rejects.toMatchObject({
        status: 429,
        response: expect.objectContaining({
          retryAfterSeconds: expect.any(Number),
        }),
      });
    });

    it('never returns the code to the caller', async () => {
      const result = await service.requestOtp({ ...base });

      expect(JSON.stringify(result)).not.toMatch(/\b\d{6}\b/);
    });

    it('masks the phone in its response', async () => {
      const result = await service.requestOtp({ ...base });

      expect(result.phone).toBe('+250 78* *** 456');
      expect(result.phone).not.toContain('123');
    });
  });

  // -------------------------------------------------------------------------
  describe('resendOtp', () => {
    it('refuses with 429 inside the cooldown', async () => {
      prisma.phoneOtp.findFirst.mockResolvedValue(
        liveOtp({ lastSentAt: new Date(Date.now() - 10_000) }),
      );

      // Unlike a plain re-request, an explicit resend is the case the client
      // is expected to handle, so it gets a real error with Retry-After.
      await expect(service.resendOtp({ ...base })).rejects.toMatchObject({
        status: 429,
      });
      expect(prisma.phoneOtp.create).not.toHaveBeenCalled();
    });

    it('reports how long is left', async () => {
      prisma.phoneOtp.findFirst.mockResolvedValue(
        liveOtp({ lastSentAt: new Date(Date.now() - 10_000) }),
      );

      await expect(service.resendOtp({ ...base })).rejects.toMatchObject({
        response: expect.objectContaining({
          retryAfterSeconds: expect.any(Number),
        }),
      });
    });

    it('issues a new code after the cooldown', async () => {
      prisma.phoneOtp.findFirst.mockResolvedValue(
        liveOtp({
          lastSentAt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS - 1),
        }),
      );

      await service.resendOtp({ ...base });

      expect(prisma.phoneOtp.create).toHaveBeenCalledTimes(1);
    });

    it('issues a code when none is outstanding', async () => {
      prisma.phoneOtp.findFirst.mockResolvedValue(null);

      await service.resendOtp({ ...base });

      expect(prisma.phoneOtp.create).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('verifyOtp', () => {
    /** A stored OTP whose hash really is `code`. */
    async function otpFor(code: string, overrides = {}) {
      return liveOtp({ codeHash: await bcrypt.hash(code, 4), ...overrides });
    }

    it('accepts the right code and records the proven number', async () => {
      prisma.phoneOtp.findFirst.mockResolvedValue(await otpFor('123456'));

      const result = await service.verifyOtp({ ...base, code: '123456' });

      expect(result.verified).toBe(true);
      expect(result.phoneVerifiedAt).toBeDefined();

      // Consume and record proof atomically: a used code with no proof strands
      // the caller, proof against a reusable code is worse.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const ops = prisma.$transaction.mock.calls[0][0];
      expect(ops).toHaveLength(2);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            verifiedPhone: PHONE,
            phoneVerifiedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('looks the code up against the phone it was issued for', async () => {
      prisma.phoneOtp.findFirst.mockResolvedValue(await otpFor('123456'));

      await service.verifyOtp({ ...base, code: '123456' });

      // Without this, a code texted to a number the caller controls could be
      // redeemed to "verify" a different one.
      expect(prisma.phoneOtp.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ phone: PHONE, consumedAt: null }),
        }),
      );
    });

    it('rejects a wrong code and counts the attempt', async () => {
      prisma.phoneOtp.findFirst.mockResolvedValue(await otpFor('123456'));

      await expect(
        service.verifyOtp({ ...base, code: '999999' }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.phoneOtp.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ attempts: 1 }) }),
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('tells the caller how many attempts remain', async () => {
      prisma.phoneOtp.findFirst.mockResolvedValue(await otpFor('123456'));

      await expect(
        service.verifyOtp({ ...base, code: '999999' }),
      ).rejects.toThrow(/4 attempts remaining/);
    });

    it('burns the code on the last tolerated miss', async () => {
      prisma.phoneOtp.findFirst.mockResolvedValue(
        await otpFor('123456', { attempts: OTP_MAX_ATTEMPTS - 1 }),
      );

      await expect(
        service.verifyOtp({ ...base, code: '999999' }),
      ).rejects.toThrow(/too many incorrect attempts/i);

      // Expiring it here stops an attacker keeping the record alive by
      // pausing between guesses.
      const { data } = prisma.phoneOtp.update.mock.calls[0][0];
      expect(data.attempts).toBe(OTP_MAX_ATTEMPTS);
      expect(data.expiresAt).toBeInstanceOf(Date);
    });

    it('refuses a code that already hit the attempt cap', async () => {
      prisma.phoneOtp.findFirst.mockResolvedValue(
        await otpFor('123456', { attempts: OTP_MAX_ATTEMPTS }),
      );

      await expect(
        service.verifyOtp({ ...base, code: '123456' }),
      ).rejects.toThrow(/too many incorrect attempts/i);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses an expired code, even the correct one', async () => {
      prisma.phoneOtp.findFirst.mockResolvedValue(
        await otpFor('123456', { expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(
        service.verifyOtp({ ...base, code: '123456' }),
      ).rejects.toThrow(/expired/i);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses when no code is outstanding', async () => {
      prisma.phoneOtp.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyOtp({ ...base, code: '123456' }),
      ).rejects.toThrow('Invalid code');
    });

    it('refuses for an unknown account without saying so', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyOtp({ ...base, code: '123456' }),
      ).rejects.toThrow('Invalid code');
    });

    it('rejects a number outside RW/UG before touching the database', async () => {
      await expect(
        service.verifyOtp({ ...base, phone: '+1 415 555 0100', code: '123456' }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('masks the phone in its response', async () => {
      prisma.phoneOtp.findFirst.mockResolvedValue(await otpFor('123456'));

      const result = await service.verifyOtp({ ...base, code: '123456' });

      expect(result.phone).toBe('+250 78* *** 456');
    });
  });

  // -------------------------------------------------------------------------
  describe('delivery stub', () => {
    it('logs the code in a non-production environment', async () => {
      const warn = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      await service.requestOtp({ ...base });

      expect(
        warn.mock.calls.some((c) => String(c[0]).includes('[OTP DEV MODE]')),
      ).toBe(true);
    });

    it('never logs the code in production, and says it cannot deliver', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          OtpService,
          { provide: PrismaService, useValue: prisma },
          {
            provide: ConfigService,
            useValue: { get: jest.fn().mockReturnValue('production') },
          },
        ],
      }).compile();
      const prod = moduleRef.get(OtpService);

      const warn = jest
        .spyOn((prod as any).logger, 'warn')
        .mockImplementation(() => undefined);
      const error = jest
        .spyOn((prod as any).logger, 'error')
        .mockImplementation(() => undefined);

      await prod.requestOtp({ ...base });

      expect(
        warn.mock.calls.some((c) => String(c[0]).includes('[OTP DEV MODE]')),
      ).toBe(false);
      // A production deploy that cannot text anyone should be loud.
      expect(
        error.mock.calls.some((c) => String(c[0]).includes('No SMS provider')),
      ).toBe(true);
    });
  });
});
