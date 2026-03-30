/**
 * Auth Utils — password hashing dengan bcrypt (via Node.js crypto)
 *
 * Menggunakan scrypt (built-in Node.js) sebagai pengganti bcrypt
 * supaya tidak perlu native dependency tambahan.
 */

import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/**
 * Hash password → "salt:hash" format
 */
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify password terhadap hash
 */
export async function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);
  const hashBuffer = Buffer.from(hash, 'hex');
  return timingSafeEqual(derivedKey, hashBuffer);
}
