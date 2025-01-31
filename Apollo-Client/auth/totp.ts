import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { encode } from '../utils/base32';

export const TOTP_SECRET_SIZE = 20;
export const RECOVERY_CODE_LENGTH = 16;
/**
 * Generates a secret for TOTP (Time-Based One-Time Password) authentication.
 * 
 * @returns {string} The generated secret.
 */
export function generateSecret(): string {
  const secret = randomBytes(TOTP_SECRET_SIZE)
    .toString('base64')
    .slice(0, TOTP_SECRET_SIZE);

  return encode(secret).replace(/=/g, '');
}
/**
 * Generates recovery codes.
 * 
 * @returns A promise that resolves to an object with two arrays: 'raw' and 'hashed'.
 *          The 'raw' array contains the generated recovery codes as strings.
 *          The 'hashed' array contains the hashed versions of the recovery codes.
 */
export async function generateRecoveryCodes(): Promise<{
  raw: string[];
  hashed: string[];
}> {
  const codes: { raw: string[]; hashed: string[] } = {
    raw: [],
    hashed: []
  };

  for (let i = 0; i < 10; i++) {
    const code = randomBytes(RECOVERY_CODE_LENGTH / 2).toString('hex');
    codes.raw.push(code);
  }

  codes.hashed = await Promise.all(codes.raw.map(code => argon2.hash(code)));
  return codes;
}
