// backend/src/common/utils/file-signature.util.ts

export type AllowedLabResultFileType = 'image/jpeg' | 'image/png' | 'application/pdf';

const SIGNATURES: Record<AllowedLabResultFileType, Buffer[]> = {
  'image/jpeg': [Buffer.from([0xff, 0xd8, 0xff])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  'application/pdf': [Buffer.from('%PDF', 'ascii')],
};

const MIME_ALIASES: Record<string, AllowedLabResultFileType> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'application/pdf': 'application/pdf',
};

/**
 * Verifies the buffer's actual magic bytes match one of the allowed
 * lab-result file types, regardless of the client-supplied mimetype
 * header (which can be spoofed).
 */
export function detectLabResultFileType(buffer: Buffer): AllowedLabResultFileType | null {
  for (const [type, signatures] of Object.entries(SIGNATURES) as [
    AllowedLabResultFileType,
    Buffer[],
  ][]) {
    for (const signature of signatures) {
      if (buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature)) {
        return type;
      }
    }
  }
  return null;
}

export function normalizeMimeType(mimetype: string): AllowedLabResultFileType | null {
  return MIME_ALIASES[mimetype] ?? null;
}

/**
 * Returns true only if the client-supplied mimetype AND the buffer's
 * real magic bytes agree on the same allowed type.
 */
export function isValidLabResultFile(mimetype: string, buffer: Buffer): boolean {
  const claimed = normalizeMimeType(mimetype);
  if (!claimed) return false;
  const actual = detectLabResultFileType(buffer);
  return actual === claimed;
}
