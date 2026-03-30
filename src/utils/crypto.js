/**
 * Crypto Utils — AES-256-GCM encrypt/decrypt untuk credentials
 *
 * Dipakai untuk encrypt auth_pass dan auth_pin di database.
 * Key dari environment variable ENCRYPTION_KEY.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT = 'report-bot-salt-v1';

function getKey() {
  const secret = process.env.ENCRYPTION_KEY || 'default-dev-key-change-in-production';
  return scryptSync(secret, SALT, 32);
}

/**
 * Encrypt plaintext → hex string (iv:encrypted:tag)
 */
export function encrypt(plaintext) {
  if (!plaintext) return null;

  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${encrypted}:${tag.toString('hex')}`;
}

/**
 * Decrypt hex string → plaintext
 */
export function decrypt(encryptedStr) {
  if (!encryptedStr) return null;

  // Jika bukan format encrypted (tidak ada :), return as-is (plain text lama)
  if (!encryptedStr.includes(':')) return encryptedStr;

  try {
    const key = getKey();
    const [ivHex, encrypted, tagHex] = encryptedStr.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    // Jika decrypt gagal, mungkin plain text — return as-is
    return encryptedStr;
  }
}
