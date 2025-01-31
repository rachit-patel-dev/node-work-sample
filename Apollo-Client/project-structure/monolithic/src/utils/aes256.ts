import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash
} from 'crypto';

const IV_LENGTH = 16; // For AES, this is always 16
const AES_ALGO = 'aes-256-cbc';

/**
 * Encrypts the given data using AES-256-CBC algorithm with the provided secret.
 * 
 * @param {string} data - The data to be encrypted.
 * @param {string} secret - The secret key used for encryption.
 * @returns {string} - The encrypted data in the format: IV:EncryptedData.
 */
export function encrypt(data: string, secret: string) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(AES_ALGO, sha256(secret), iv);

  let encryptedBuffer = cipher.update(data);
  encryptedBuffer = Buffer.concat([encryptedBuffer, cipher.final()]);

  return `${iv.toString('hex')}:${encryptedBuffer.toString('hex')}`;
}

/**
 * Decrypts the given encrypted data using the provided secret.
 * 
 * @param encryptedData - The encrypted data to be decrypted.
 * @param secret - The secret used for decryption. It can be either a string or a Buffer.
 * @returns The decrypted data as a string.
 */
export function decrypt(encryptedData: string, secret: string | Buffer) {
  const [ivText, encryptedText] = encryptedData.split(':');
  const iv = Buffer.from(ivText, 'hex');
  const secretBuffer = Buffer.isBuffer(secret) ? secret : sha256(secret);
  const decipher = createDecipheriv(AES_ALGO, secretBuffer, iv);

  let decryptedBuffer = decipher.update(Buffer.from(encryptedText, 'hex'));
  decryptedBuffer = Buffer.concat([decryptedBuffer, decipher.final()]);

  return decryptedBuffer.toString();
}

/**
 * Calculates the SHA256 hash of the given data.
 * 
 * @param data - The data to be hashed.
 * @returns The SHA256 hash of the data.
 */
function sha256(data: string) {
  return createHash('sha256')
    .update(data, 'utf8')
    .digest();
}
