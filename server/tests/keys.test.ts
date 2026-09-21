import { describe, it, expect } from 'vitest';
import { generateUniversityKeyPair, encryptPrivateKey, decryptPrivateKey, computePublicKeyFingerprint } from '../src/crypto/keys';

const TEST_SECRET = 'e7b89f2d1a4c3e5b6a7d8c9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90';
const WRONG_SECRET = '1111111111111111111111111111111111111111111111111111111111111111';

describe('University ECDSA P-256 Key Management & AES-256-GCM Encryption', () => {
  it('should generate a valid P-256 key pair with correct kid and JWK format', () => {
    const keyPair = generateUniversityKeyPair(1, 1, TEST_SECRET);

    expect(keyPair.kid).toBe('uni_1_k1');
    expect(keyPair.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(keyPair.privateKeyEnc).toBeDefined();

    // Verify JWK structure
    expect(keyPair.publicJwk).toMatchObject({
      kty: 'EC',
      crv: 'P-256',
      kid: 'uni_1_k1',
      use: 'sig',
      alg: 'ES256',
    });
    expect(keyPair.publicJwk.x).toBeDefined();
    expect(keyPair.publicJwk.y).toBeDefined();
  });

  it('should encrypt and decrypt private key reliably using AES-256-GCM', () => {
    const keyPair = generateUniversityKeyPair('vit', 2, TEST_SECRET);
    const decrypted = decryptPrivateKey(keyPair.privateKeyEnc, TEST_SECRET);

    expect(decrypted).toContain('BEGIN PRIVATE KEY');
  });

  it('should fail decryption if wrong encryption secret is provided (AEAD authentication tag verification)', () => {
    const keyPair = generateUniversityKeyPair(1, 1, TEST_SECRET);

    expect(() => {
      decryptPrivateKey(keyPair.privateKeyEnc, WRONG_SECRET);
    }).toThrow();
  });

  it('should produce consistent public key fingerprints', () => {
    const keyPair = generateUniversityKeyPair(42, 1, TEST_SECRET);
    const fp1 = computePublicKeyFingerprint(keyPair.publicKeyPem);
    const fp2 = computePublicKeyFingerprint(keyPair.publicKeyPem);

    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(64); // SHA-256 hex
  });
});
