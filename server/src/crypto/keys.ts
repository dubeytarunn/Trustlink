import crypto from 'crypto';

export interface KeyPairResult {
  kid: string;
  publicKeyPem: string;
  publicJwk: Record<string, unknown>;
  privateKeyEnc: string;
  fingerprint: string;
}

/**
 * Encrypts a private key at rest using AES-256-GCM and a master key.
 * Master key must be 32 bytes (64 hex characters or 32 raw bytes).
 */
export function encryptPrivateKey(privateKeyPem: string, masterKeyHex: string): string {
  const key = Buffer.from(masterKeyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('KEY_ENCRYPTION_SECRET must be a 32-byte hex string (64 characters)');
  }

  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKeyPem, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    tag: tag.toString('base64'),
  });
}

/**
 * Decrypts an AES-256-GCM encrypted private key back to PEM string in memory.
 */
export function decryptPrivateKey(encryptedJson: string, masterKeyHex: string): string {
  const key = Buffer.from(masterKeyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('KEY_ENCRYPTION_SECRET must be a 32-byte hex string (64 characters)');
  }

  const parsed = JSON.parse(encryptedJson);
  const iv = Buffer.from(parsed.iv, 'base64');
  const ciphertext = Buffer.from(parsed.ciphertext, 'base64');
  const tag = Buffer.from(parsed.tag, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Computes a SHA-256 fingerprint (hex) of a public key.
 */
export function computePublicKeyFingerprint(publicKeyPem: string): string {
  return crypto.createHash('sha256').update(publicKeyPem).digest('hex');
}

/**
 * Generates an ECDSA P-256 key pair for a university, encrypts the private key,
 * and exports public key in both PEM and JWK formats.
 */
export function generateUniversityKeyPair(
  universityId: number | string,
  keyVersion: number = 1,
  masterKeyHex: string
): KeyPairResult {
  const kid = `uni_${universityId}_k${keyVersion}`;

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  // Export JWK representation of the public key
  const keyObject = crypto.createPublicKey(publicKey);
  const jwk = keyObject.export({ format: 'jwk' }) as Record<string, unknown>;
  const publicJwk = {
    ...jwk,
    kid,
    use: 'sig',
    alg: 'ES256',
  };

  const privateKeyEnc = encryptPrivateKey(privateKey, masterKeyHex);
  const fingerprint = computePublicKeyFingerprint(publicKey);

  return {
    kid,
    publicKeyPem: publicKey,
    publicJwk,
    privateKeyEnc,
    fingerprint,
  };
}
