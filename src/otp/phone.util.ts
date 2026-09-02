// backend/src/otp/phone.util.ts
//
// E.164 normalization for the two markets this platform serves: Rwanda (+250)
// and Uganda (+256). Deliberately hand-rolled rather than pulling in
// libphonenumber: we need exactly two country codes, both of which have a
// single, stable mobile shape, and a 300KB metadata dependency to check
// `^\+25[06]7\d{8}$` is not a trade worth making.
//
// Mobile numbering in both markets:
//   Rwanda  +250 7XXXXXXXX  (9 national digits, all mobile prefixes start 7)
//   Uganda  +256 7XXXXXXXX  (9 national digits, mobile prefixes start 7)
//
// Landlines and the Ugandan 3XX ranges are deliberately rejected: an OTP has to
// arrive by SMS, and this platform only ever texts mobiles. Widening the rule
// means changing `MOBILE_NATIONAL` below and nothing else.

import { BadRequestException } from '@nestjs/common';

/** The regions this platform issues OTPs in. */
export type PhoneRegion = 'RW' | 'UG';

/** Dialling code per region. */
export const REGION_DIALLING_CODE: Record<PhoneRegion, string> = {
  RW: '250',
  UG: '256',
};

/** Reverse lookup, for reporting which market a number belongs to. */
export const DIALLING_CODE_REGION: Record<string, PhoneRegion> = {
  '250': 'RW',
  '256': 'UG',
};

/**
 * A normalized number: `+250` or `+256` followed by nine digits starting `7`.
 *
 * This is the only shape that may be stored or sent to an SMS gateway.
 */
export const E164_RW_UG = /^\+25[06]7\d{8}$/;

/** National-significant mobile number: nine digits, first digit 7. */
const MOBILE_NATIONAL = /^7\d{8}$/;

/**
 * Normalizes a phone number to E.164 for Rwanda or Uganda.
 *
 * Accepts, with any mix of spaces, dashes, dots and parentheses:
 *   +250788123456 / 00250788123456 / 250788123456   -> +250788123456
 *   +256772123456 / 00256772123456 / 256772123456   -> +256772123456
 *   0788123456 / 788123456                          -> needs `defaultRegion`
 *
 * A bare national number is ambiguous between the two markets — `0788123456`
 * is a valid Rwandan *and* Ugandan-shaped number — so it is only accepted when
 * the caller states which market it came from. Guessing would silently text
 * the wrong country.
 *
 * @throws BadRequestException with a field-scoped message, so the global
 *   exception filter renders it the same way `class-validator` failures are.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultRegion?: PhoneRegion,
): string {
  if (raw === null || raw === undefined) {
    throw new BadRequestException('phone is required');
  }

  // Strip everything a human might type as punctuation. A leading '+' is
  // significant, so it is remembered before the strip rather than after.
  const trimmed = String(raw).trim();
  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');

  if (digits.length === 0) {
    throw new BadRequestException('phone is required');
  }

  let national: string | null = null;
  let diallingCode: string | null = null;

  // 00 is the international access prefix used across East Africa; treat it
  // exactly like a '+'.
  const withoutIddPrefix = digits.startsWith('00') ? digits.slice(2) : digits;

  for (const code of Object.keys(DIALLING_CODE_REGION)) {
    if (withoutIddPrefix.startsWith(code)) {
      diallingCode = code;
      national = withoutIddPrefix.slice(code.length);
      break;
    }
  }

  if (national === null) {
    // No recognisable country code. Either it is a national number, or it is a
    // number from somewhere this platform does not operate.
    if (hadPlus || digits.startsWith('00')) {
      throw new BadRequestException(
        'phone must be a Rwandan (+250) or Ugandan (+256) mobile number',
      );
    }

    if (!defaultRegion) {
      throw new BadRequestException(
        'phone must include a country code (+250 or +256)',
      );
    }

    diallingCode = REGION_DIALLING_CODE[defaultRegion];
    // A national number may carry a trunk '0' prefix: 0788… -> 788…
    national = digits.startsWith('0') ? digits.slice(1) : digits;
  }

  if (!MOBILE_NATIONAL.test(national)) {
    throw new BadRequestException(
      'phone must be a 9-digit mobile number starting with 7',
    );
  }

  const e164 = `+${diallingCode}${national}`;

  // Belt and braces: the only value that leaves this function is one the
  // storage-and-gateway contract accepts.
  if (!E164_RW_UG.test(e164)) {
    throw new BadRequestException(
      'phone must be a Rwandan (+250) or Ugandan (+256) mobile number',
    );
  }

  return e164;
}

/** Whether `value` is already a normalized RW/UG mobile number. */
export function isNormalizedPhone(value: string): boolean {
  return E164_RW_UG.test(value);
}

/** Which market a normalized number belongs to. */
export function regionOf(e164: string): PhoneRegion {
  if (!E164_RW_UG.test(e164)) {
    throw new BadRequestException('phone is not a normalized RW/UG number');
  }
  return DIALLING_CODE_REGION[e164.slice(1, 4)];
}

/**
 * Masks a number for logs and user-facing copy: `+250788123456` ->
 * `+250 78* *** 456`.
 *
 * Enough for someone to recognise their own handset, not enough for a log
 * scraper to harvest a contact list.
 */
export function maskPhone(e164: string): string {
  if (!E164_RW_UG.test(e164)) return '***';
  const code = e164.slice(0, 4);
  const national = e164.slice(4);
  return `${code} ${national.slice(0, 2)}* *** ${national.slice(6)}`;
}
