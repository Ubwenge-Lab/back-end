import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
// Ensure key is exactly 32 bytes (256 bits) long. If not set, generate a fallback.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY 
  ? Buffer.from(process.env.ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)) 
  : Buffer.alloc(32, 'fallback_encryption_key_123456');
const IV_LENGTH = 16;

/**
 * Deterministic Encryption
 * Uses a static IV so that the same input always produces the same output.
 * Crucial for exact-match database queries (e.g., WHERE phone = '...').
 */
export function encryptDeterministic(text: string): string {
  if (!text) return text;
  try {
    const iv = Buffer.alloc(IV_LENGTH, 0); 
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return encrypted.toString('hex');
  } catch (err) {
    return text; // Fallback if already encrypted or error
  }
}

export function decryptDeterministic(text: string): string {
  if (!text) return text;
  try {
    const iv = Buffer.alloc(IV_LENGTH, 0);
    const encryptedText = Buffer.from(text, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    return text;
  }
}

/**
 * Non-Deterministic Encryption
 * Uses a random IV for maximum security. Output is different every time.
 * Used for large text fields like notes or diagnosis where exact match queries aren't needed.
 */
export function encryptNonDeterministic(text: string): string {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (err) {
    return text;
  }
}

export function decryptNonDeterministic(text: string): string {
  if (!text) return text;
  try {
    const textParts = text.split(':');
    if (textParts.length !== 2) return text; // Not encrypted with this method
    
    const iv = Buffer.from(textParts[0], 'hex');
    const encryptedText = Buffer.from(textParts[1], 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    return text;
  }
}
