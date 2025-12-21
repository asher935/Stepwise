/**
 * Cryptographic utilities for Stepwise
 *
 * Provides secure random token generation, hashing, and encryption functions
 */

import { randomBytes, createHash, createHmac, scrypt, createCipheriv, createDecipheriv } from 'crypto';

/**
 * Generate cryptographically secure random bytes
 * @param size - Number of bytes to generate
 * @returns Buffer containing random bytes
 */
export function generateRandomBytes(size: number): Buffer {
  return randomBytes(size);
}

/**
 * Generate a secure random token in base64 format
 * @param size - Number of bytes for the token (default: 32)
 * @returns Base64 encoded token
 */
export function generateRandomToken(size: number = 32): string {
  return generateRandomBytes(size).toString('base64url');
}

/**
 * Generate a secure random token in hex format
 * @param size - Number of bytes for the token (default: 32)
 * @returns Hex encoded token
 */
export function generateRandomHexToken(size: number = 32): string {
  return generateRandomBytes(size).toString('hex');
}

/**
 * Generate a UUID v4
 * @returns UUID string
 */
export function generateUUID(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // Variant 10

  return [
    bytes.subarray(0, 4).toString('hex'),
    bytes.subarray(4, 6).toString('hex'),
    bytes.subarray(6, 8).toString('hex'),
    bytes.subarray(8, 10).toString('hex'),
    bytes.subarray(10, 16).toString('hex')
  ].join('-');
}

/**
 * Compute SHA-256 hash of data
 * @param data - Data to hash
 * @param encoding - Output encoding (default: 'hex')
 * @returns Hash string
 */
export function sha256(data: string | Buffer, encoding: 'hex' | 'base64' | 'base64url' = 'hex'): string {
  return createHash('sha256').update(data instanceof Buffer ? data.toString() : data).digest(encoding);
}

/**
 * Compute HMAC with SHA-256
 * @param key - Secret key
 * @param data - Data to sign
 * @param encoding - Output encoding (default: 'hex')
 * @returns HMAC signature
 */
export function hmacSha256(
  key: string | Buffer,
  data: string | Buffer,
  encoding: 'hex' | 'base64' | 'base64url' = 'hex'
): string {
  return createHmac('sha256', key instanceof Buffer ? key.toString() : key).update(data instanceof Buffer ? data.toString() : data).digest(encoding);
}

/**
 * Derive a key from password using scrypt
 * @param password - Password string
 * @param salt - Salt value
 * @param keylen - Desired key length in bytes
 * @returns Derived key as Buffer
 */
export async function deriveKey(
  password: string,
  salt: string,
  keylen: number = 64
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Encrypt data with password using AES-256-GCM
 * @param data - Data to encrypt
 * @param password - Password for encryption
 * @returns Encrypted data object with ciphertext, iv, tag, and salt
 */
export async function encryptWithPassword(data: string, password: string): Promise<{
  ciphertext: string;
  iv: string;
  tag: string;
  salt: string;
}> {
  const salt = generateRandomBytes(16).toString('hex');
  const iv = generateRandomBytes(12).toString('hex');
  const key = await deriveKey(password, salt, 32);

  const cipher = createCipheriv('aes-256-gcm', new Uint8Array(key), new Uint8Array(Buffer.from(iv, 'hex')));
  let ciphertext = cipher.update(data, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    ciphertext,
    iv,
    tag,
    salt
  };
}

/**
 * Decrypt data with password using AES-256-GCM
 * @param encryptedData - Encrypted data object
 * @param password - Password for decryption
 * @returns Decrypted data string
 */
export async function decryptWithPassword(
  encryptedData: {
    ciphertext: string;
    iv: string;
    tag: string;
    salt: string;
  },
  password: string
): Promise<string> {
  const key = await deriveKey(password, encryptedData.salt, 32);

  const decipher = createDecipheriv('aes-256-gcm', new Uint8Array(key), new Uint8Array(Buffer.from(encryptedData.iv, 'hex')));
  decipher.setAuthTag(new Uint8Array(Buffer.from(encryptedData.tag, 'hex')));

  let decrypted = decipher.update(encryptedData.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt a buffer with password using AES-256-GCM
 * @param buffer - Buffer to encrypt
 * @param password - Password for encryption
 * @returns Encrypted data object with ciphertext, iv, tag, and salt
 */
export async function encryptBuffer(buffer: Buffer, password: string): Promise<{
  ciphertext: Buffer;
  iv: string;
  tag: string;
  salt: string;
}> {
  const salt = generateRandomBytes(16).toString('hex');
  const iv = generateRandomBytes(12);
  const key = await deriveKey(password, salt, 32);

  const keyUint8Array = new Uint8Array(key);
  const ivUint8Array = new Uint8Array(iv);
  const cipher = createCipheriv('aes-256-gcm', keyUint8Array, ivUint8Array);

  // Convert data to buffer if it's a string
  const dataBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const ciphertext = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    salt
  };
}

/**
 * Decrypt a buffer with password using AES-256-GCM
 * @param encryptedData - Encrypted data object
 * @param password - Password for decryption
 * @returns Decrypted buffer
 */
export async function decryptBuffer(
  encryptedData: {
    ciphertext: Buffer;
    iv: string;
    tag: string;
    salt: string;
  },
  password: string
): Promise<Buffer> {
  const key = await deriveKey(password, encryptedData.salt, 32);

  const keyUint8Array = new Uint8Array(key);
  const ivUint8Array = new Uint8Array(Buffer.from(encryptedData.iv, 'hex'));
  const tagUint8Array = new Uint8Array(Buffer.from(encryptedData.tag, 'hex'));

  const decipher = createDecipheriv('aes-256-gcm', keyUint8Array, ivUint8Array);
  decipher.setAuthTag(tagUint8Array);

  return Buffer.concat([decipher.update(encryptedData.ciphertext), decipher.final()]);
}

/**
 * Hash data with specified algorithm
 * @param data - Data to hash
 * @param algorithm - Hash algorithm (default: 'sha256')
 * @returns Hash string
 */
export async function hashData(data: string, algorithm: string = 'sha256'): Promise<string> {
  return createHash(algorithm).update(data).digest('hex');
}

/**
 * Generate an export token
 * @returns Export token string
 */
export function generateExportToken(): string {
  return generateRandomToken(24);
}

/**
 * Constants for token generation
 */
export const TOKEN_CONSTANTS = {
  SESSION_TOKEN_BYTES: 32,
  CSRF_TOKEN_BYTES: 32,
  API_KEY_BYTES: 64,
  INVITE_TOKEN_BYTES: 16,
  PASSWORD_RESET_BYTES: 32,
  VERIFICATION_CODE_BYTES: 6,
  SESSION_COOKIE_NAME: 'stepwise-session',
  CSRF_COOKIE_NAME: 'stepwise-csrf'
} as const;

/**
 * Session token information
 */
export interface SessionToken {
  token: string;
  expiresAt: Date;
}

/**
 * Generate a session token with expiration
 * @param expiresIn - Time until expiration in milliseconds (default: 24 hours)
 * @returns Session token object
 */
export async function generateSessionToken(expiresIn?: number): Promise<SessionToken> {
  // Use provided value or default to 24 hours
  const expirationMs = expiresIn || 24 * 60 * 60 * 1000;
  const expiresAt = Date.now() + expirationMs;

  // Generate a cryptographically secure random token
  const token = generateRandomToken(TOKEN_CONSTANTS.SESSION_TOKEN_BYTES);

  return {
    token,
    expiresAt: new Date(expiresAt)
  };
}

/**
 * Generate a CSRF token
 * @returns CSRF token string
 */
export function generateCSRFToken(): string {
  return generateRandomToken(TOKEN_CONSTANTS.CSRF_TOKEN_BYTES);
}

/**
 * Generate an API key
 * @returns API key string with prefix
 */
export function generateAPIKey(): string {
  const token = generateRandomToken(TOKEN_CONSTANTS.API_KEY_BYTES);
  return `stepwise_${token}`;
}

/**
 * Generate an invitation token
 * @returns Invitation token string
 */
export function generateInviteToken(): string {
  return generateRandomToken(TOKEN_CONSTANTS.INVITE_TOKEN_BYTES);
}

/**
 * Generate a password reset token
 * @returns Password reset token string
 */
export function generatePasswordResetToken(): string {
  return generateRandomToken(TOKEN_CONSTANTS.PASSWORD_RESET_BYTES);
}

/**
 * Generate a numeric verification code
 * @returns 6-digit verification code string
 */
export function generateVerificationCode(): string {
  const max = 10 ** TOKEN_CONSTANTS.VERIFICATION_CODE_BYTES;
  const code = Math.floor(Math.random() * max);
  return code.toString().padStart(TOKEN_CONSTANTS.VERIFICATION_CODE_BYTES, '0');
}

/**
 * Utility: Compare two strings in constant time to prevent timing attacks
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return createHmac('sha256', a).update(b).digest('hex') ===
         createHmac('sha256', a).update(a).digest('hex');
}

/**
 * Utility: Creates a deterministic hash from input data
 * @param data - Input data
 * @param salt - Optional salt
 * @returns Deterministic hash
 */
export function deterministicHash(data: string, salt: string = ''): string {
  return sha256(`${salt}:${data}`, 'base64url');
}

/**
 * Utility: Generates a short code for URLs or references
 * @param length - Length of the code (default: 8)
 * @returns Short code string
 */
export function generateShortCode(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = generateRandomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars[bytes[i]! % chars.length];
  }

  return result;
}

/**
 * Utility: Converts a buffer or Uint8Array to base64 string
 * @param buffer - The buffer to convert
 * @returns Base64 encoded string
 */
function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Utility: Converts a base64 string to Uint8Array
 * @param base64 - The base64 string to convert
 * @returns Uint8Array
 */
function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Utility: Mask sensitive data in logs
 * @param data - Sensitive data to mask
 * @param visibleChars - Number of characters to show at start and end
 * @returns Masked string
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (data.length <= visibleChars * 2) {
    return '*'.repeat(data.length);
  }

  const start = data.substring(0, visibleChars);
  const end = data.substring(data.length - visibleChars);
  const middle = '*'.repeat(data.length - (visibleChars * 2));

  return `${start}${middle}${end}`;
}

/**
 * Utility: Generate a fingerprint for browser identification
 * @param userAgent - Browser user agent string
 * @param ip - IP address
 * @returns Browser fingerprint
 */
export function generateBrowserFingerprint(userAgent: string, ip: string): string {
  return sha256(`${userAgent}:${ip}:${Date.now()}`).substring(0, 32);
}