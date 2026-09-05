import { ProfileService } from './profile.service';
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

describe('ProfileService', () => {
  let service: ProfileService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let notifications: { sendVerificationEmail: jest.Mock };

  const baseUser = {
    id: 'u1',
    email: 'tony@evuze.rw',
    phone: '+250780000000',
    firstName: 'Tony',
    lastName: 'Niyonkuru',
    role: 'PATIENT',
    country: null,
    locale: null,
    isVerified: true,
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    notifications = { sendVerificationEmail: jest.fn().mockResolvedValue(undefined) };
    service = new ProfileService(prisma as any, notifications as any);
  });

  describe('getMe', () => {
    it('returns the mapped profile with avatarUrl null', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);

      const profile = await service.getMe('u1');

      expect(profile.email).toBe('tony@evuze.rw');
      expect(profile.avatarUrl).toBeNull();
      expect(profile.country).toBeNull();
      // password hash must never be selected
      const select = prisma.user.findUnique.mock.calls[0][0].select;
      expect(select).not.toHaveProperty('password');
      expect(select).not.toHaveProperty('refreshToken');
    });

    it('throws BadRequest when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe('ghost')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('updateMe', () => {
    it('applies name/country/locale updates', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.user.update.mockResolvedValue({
        ...baseUser,
        country: 'RW',
        locale: 'en',
      });

      const updated = await service.updateMe('u1', {
        country: 'RW',
        locale: 'en',
        firstName: 'Robert',
      });

      expect(updated.country).toBe('RW');
      expect(updated.locale).toBe('en');
      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data).toEqual({
        firstName: 'Robert',
        country: 'RW',
        locale: 'en',
      });
    });

    it('rejects an out-of-set country at the service layer', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });

      await expect(
        service.updateMe('u1', { country: 'KE' as any }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an out-of-set locale (D9 set honoured)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });

      await expect(
        service.updateMe('u1', { locale: 'lg' as any }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('requestContactCode', () => {
    it('stores a 5-digit code and emails it for an email change', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'old@x.rw' });
      prisma.user.update.mockResolvedValue({ id: 'u1' });

      const result = await service.requestContactCode('u1', {
        email: 'new@x.rw',
      });

      expect(result.message).toContain('sent');
      const updateArgs = prisma.user.update.mock.calls[0];
      const code = updateArgs[0].data.verificationCode as string;
      expect(code).toMatch(/^\d{5}$/);
      expect(notifications.sendVerificationEmail).toHaveBeenCalledWith(
        'new@x.rw',
        code,
      );
    });

    it('stores a code for a phone change without emailing (dev-log path, D7)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@x.rw' });
      prisma.user.update.mockResolvedValue({ id: 'u1' });

      await service.requestContactCode('u1', { phone: '+256700000000' });

      expect(notifications.sendVerificationEmail).not.toHaveBeenCalled();
      const code = prisma.user.update.mock.calls[0][0].data.verificationCode;
      expect(code).toMatch(/^\d{5}$/);
    });
  });

  describe('verifyContactChange', () => {
    const withCode = (code: string, expiry?: Date) => ({
      id: 'u1',
      verificationCode: code,
      verificationCodeExpiry:
        expiry ?? new Date(Date.now() + 60 * 60 * 1000),
    });

    it('rejects without a valid code (400)', async () => {
      prisma.user.findUnique.mockResolvedValue(withCode('12345'));

      await expect(
        service.verifyContactChange('u1', { email: 'new@x.rw', code: '99999' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an expired code', async () => {
      prisma.user.findUnique.mockResolvedValue(
        withCode('12345', new Date(Date.now() - 1000)),
      );

      await expect(
        service.verifyContactChange('u1', { email: 'new@x.rw', code: '12345' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the new email belongs to another account (409)', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(withCode('12345'))
        .mockResolvedValueOnce({ id: 'other' }); // email uniqueness probe

      await expect(
        service.verifyContactChange('u1', { email: 'taken@x.rw', code: '12345' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('applies the email change and clears the single-use code', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(withCode('12345'))
        .mockResolvedValueOnce(null); // email is free
      prisma.user.update.mockResolvedValue({
        ...baseUser,
        email: 'new@x.rw',
      });

      const result = await service.verifyContactChange('u1', {
        email: 'new@x.rw',
        code: '12345',
      });

      expect(result.email).toBe('new@x.rw');
      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data.verificationCode).toBeNull();
      expect(data.verificationCodeExpiry).toBeNull();
    });

    it('applies a phone change with a valid code', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(withCode('12345'));
      prisma.user.update.mockResolvedValue({
        ...baseUser,
        phone: '+256700000000',
      });

      const result = await service.verifyContactChange('u1', {
        phone: '+256700000000',
        code: '12345',
      });

      expect(result.phone).toBe('+256700000000');
    });
  });
});
