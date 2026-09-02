// backend/src/otp/phone.util.spec.ts
//
// E.164 normalization for Rwanda (+250) and Uganda (+256).

import { BadRequestException } from '@nestjs/common';
import {
  isNormalizedPhone,
  maskPhone,
  normalizePhone,
  regionOf,
} from './phone.util';

describe('normalizePhone', () => {
  describe('Rwanda (+250)', () => {
    it('accepts E.164 unchanged', () => {
      expect(normalizePhone('+250788123456')).toBe('+250788123456');
    });

    it('accepts every mobile prefix in use', () => {
      for (const prefix of ['72', '73', '78', '79']) {
        expect(normalizePhone(`+250${prefix}8123456`)).toBe(
          `+250${prefix}8123456`,
        );
      }
    });

    it('adds the missing plus', () => {
      expect(normalizePhone('250788123456')).toBe('+250788123456');
    });

    it('treats the 00 access prefix like a plus', () => {
      expect(normalizePhone('00250788123456')).toBe('+250788123456');
    });

    it('strips the trunk 0 from a national number', () => {
      expect(normalizePhone('0788123456', 'RW')).toBe('+250788123456');
    });

    it('accepts a national number with no trunk 0', () => {
      expect(normalizePhone('788123456', 'RW')).toBe('+250788123456');
    });
  });

  describe('Uganda (+256)', () => {
    it('accepts E.164 unchanged', () => {
      expect(normalizePhone('+256772123456')).toBe('+256772123456');
    });

    it('accepts every mobile prefix in use', () => {
      for (const prefix of ['70', '74', '75', '76', '77', '78', '79']) {
        expect(normalizePhone(`+256${prefix}2123456`)).toBe(
          `+256${prefix}2123456`,
        );
      }
    });

    it('strips the trunk 0 from a national number', () => {
      expect(normalizePhone('0772123456', 'UG')).toBe('+256772123456');
    });
  });

  describe('human formatting', () => {
    it.each([
      ['+250 788 123 456', '+250788123456'],
      ['+250-788-123-456', '+250788123456'],
      ['(+250) 788 123 456', '+250788123456'],
      ['+250.788.123.456', '+250788123456'],
      ['  +250788123456  ', '+250788123456'],
      ['+256 772 123 456', '+256772123456'],
    ])('normalizes %s', (input, expected) => {
      expect(normalizePhone(input)).toBe(expected);
    });
  });

  describe('rejections', () => {
    it('rejects a national number with no region, rather than guessing', () => {
      // 0788123456 is a valid shape in BOTH markets. Picking one would
      // silently text the wrong country.
      expect(() => normalizePhone('0788123456')).toThrow(BadRequestException);
      expect(() => normalizePhone('0788123456')).toThrow(/country code/);
    });

    it('rejects a country this platform does not operate in', () => {
      expect(() => normalizePhone('+254712345678')).toThrow(
        BadRequestException,
      );
      expect(() => normalizePhone('+1 415 555 0100')).toThrow(
        BadRequestException,
      );
    });

    it('does not let a default region override an explicit country code', () => {
      // A Kenyan number sent by a Rwandan client is still Kenyan.
      expect(() => normalizePhone('+254712345678', 'RW')).toThrow(
        BadRequestException,
      );
    });

    it('rejects a landline or non-7 prefix', () => {
      expect(() => normalizePhone('+250252123456')).toThrow(
        BadRequestException,
      );
      expect(() => normalizePhone('+256312123456')).toThrow(
        BadRequestException,
      );
    });

    it('rejects the wrong number of digits', () => {
      expect(() => normalizePhone('+25078812345')).toThrow(
        BadRequestException,
      );
      expect(() => normalizePhone('+2507881234567')).toThrow(
        BadRequestException,
      );
    });

    it('rejects empty, blank, null and undefined', () => {
      expect(() => normalizePhone('')).toThrow(BadRequestException);
      expect(() => normalizePhone('   ')).toThrow(BadRequestException);
      expect(() => normalizePhone(null)).toThrow(BadRequestException);
      expect(() => normalizePhone(undefined)).toThrow(BadRequestException);
    });

    it('rejects letters', () => {
      expect(() => normalizePhone('+250-CALL-ME')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('normalization is idempotent', () => {
    it.each(['+250788123456', '+256772123456'])('%s', (value) => {
      expect(normalizePhone(normalizePhone(value))).toBe(value);
    });
  });
});

describe('isNormalizedPhone', () => {
  it('accepts only the storage-and-gateway shape', () => {
    expect(isNormalizedPhone('+250788123456')).toBe(true);
    expect(isNormalizedPhone('+256772123456')).toBe(true);
    expect(isNormalizedPhone('0788123456')).toBe(false);
    expect(isNormalizedPhone('250788123456')).toBe(false);
    expect(isNormalizedPhone('+254712345678')).toBe(false);
  });
});

describe('regionOf', () => {
  it('reports the market', () => {
    expect(regionOf('+250788123456')).toBe('RW');
    expect(regionOf('+256772123456')).toBe('UG');
  });

  it('refuses a number that was never normalized', () => {
    expect(() => regionOf('0788123456')).toThrow(BadRequestException);
  });
});

describe('maskPhone', () => {
  it('leaves enough to recognise a handset and no more', () => {
    expect(maskPhone('+250788123456')).toBe('+250 78* *** 456');
    expect(maskPhone('+256772123456')).toBe('+256 77* *** 456');
  });

  it('never echoes something it cannot mask', () => {
    expect(maskPhone('not a phone')).toBe('***');
  });
});
