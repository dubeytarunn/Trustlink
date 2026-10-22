import crypto from 'crypto';

const KEY_LENGTH = 64;
const SCRYPT_PARAMS = {
  N: 16384, // CPU/memory cost
  r: 8,     // Block size
  p: 1,     // Parallelization
};

/**
 * Hashes a plaintext password using Node.js crypto.scrypt with a random 16-byte salt.
 * Returns format: "salt:hash" (hex encoded)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, SCRYPT_PARAMS, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifies a password against a stored "salt:hash" string using constant-time comparison.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;

  return new Promise((resolve) => {
    crypto.scrypt(password, salt, KEY_LENGTH, SCRYPT_PARAMS, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        const storedKeyBuffer = Buffer.from(key, 'hex');
        resolve(crypto.timingSafeEqual(storedKeyBuffer, derivedKey));
      } catch {
        resolve(false);
      }
    });
  });
}
