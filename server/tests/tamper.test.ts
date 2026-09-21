import { describe, it, expect } from 'vitest';
import { generateUniversityKeyPair, decryptPrivateKey } from '../src/crypto/keys';
import { buildSignedPayload, ClaimReveal } from '../src/crypto/commitments';
import { signPayload, verifyCredential, verifySignature } from '../src/crypto/sign-verify';
import { generateCredentialId } from '../src/crypto/credential-id';

const TEST_SECRET = 'e7b89f2d1a4c3e5b6a7d8c9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90';

describe('Tamper Detection & Key Rotation Invariance (NFR-06)', () => {
  // Key 1
  const uniKeyV1 = generateUniversityKeyPair(1, 1, TEST_SECRET);
  const privKeyV1 = decryptPrivateKey(uniKeyV1.privateKeyEnc, TEST_SECRET);

  // Key 2 (rotated key)
  const uniKeyV2 = generateUniversityKeyPair(1, 2, TEST_SECRET);

  const originalClaims = {
    fullName: 'Tarun Dubey',
    studentNumber: '24BAI1523',
    degree: 'Bachelor of Technology',
    grade: '8.50 CGPA',
  };

  const credId = generateCredentialId();
  const { payload, salts } = buildSignedPayload({
    credentialId: credId,
    issuer: { id: 1, name: 'Vellore Institute of Technology', kid: uniKeyV1.kid },
    credentialType: 'degree',
    issuedAt: '2026-07-18T10:00:00.000Z',
    claimsMap: originalClaims,
  });

  const validSignature = signPayload(payload, privKeyV1);

  const allReveals: ClaimReveal[] = Object.entries(originalClaims).map(([name, value]) => ({
    name,
    value,
    salt: salts[name],
  }));

  it('should detect when stored database claim value is modified directly (Tamper Lab simulation)', () => {
    // Modify grade from 8.50 to 9.99
    const tamperedReveals: ClaimReveal[] = allReveals.map((r) =>
      r.name === 'grade' ? { ...r, value: '9.99 CGPA' } : r
    );

    const result = verifyCredential({
      payload,
      signature: validSignature,
      publicKeyPem: uniKeyV1.publicKeyPem,
      reveals: tamperedReveals,
      credentialStatus: 'active',
      issuerStatus: 'active',
    });

    expect(result.outcome).toBe('invalid');
    expect(result.isValid).toBe(false);
    expect(result.tamperedClaims).toContain('grade');
  });

  it('should detect when payload metadata is modified (e.g. altering credentialId or issuedAt)', () => {
    const tamperedPayload = {
      ...payload,
      credentialId: 'TL-MUTATED-ID-1',
    };

    const isSigValid = verifySignature(tamperedPayload, validSignature, uniKeyV1.publicKeyPem);
    expect(isSigValid).toBe(false);

    const result = verifyCredential({
      payload: tamperedPayload,
      signature: validSignature,
      publicKeyPem: uniKeyV1.publicKeyPem,
      reveals: allReveals,
      credentialStatus: 'active',
      issuerStatus: 'active',
    });

    expect(result.outcome).toBe('invalid');
    expect(result.isValid).toBe(false);
    expect(result.signatureValid).toBe(false);
  });

  it('should detect when a signature is swapped from another valid credential', () => {
    // Generate a second credential with its own signature
    const credId2 = generateCredentialId();
    const { payload: payload2 } = buildSignedPayload({
      credentialId: credId2,
      issuer: { id: 1, name: 'Vellore Institute of Technology', kid: uniKeyV1.kid },
      credentialType: 'degree',
      issuedAt: '2026-07-18T11:00:00.000Z',
      claimsMap: { ...originalClaims, fullName: 'Other Student' },
    });
    const signature2 = signPayload(payload2, privKeyV1);

    // Apply signature2 to payload1
    const result = verifyCredential({
      payload,
      signature: signature2,
      publicKeyPem: uniKeyV1.publicKeyPem,
      reveals: allReveals,
      credentialStatus: 'active',
      issuerStatus: 'active',
    });

    expect(result.outcome).toBe('invalid');
    expect(result.isValid).toBe(false);
  });

  it('should ensure credentials issued under Key 1 continue to verify against Key 1 after Key 2 is active (Key Rotation)', () => {
    // Credential was issued under uniKeyV1 (kid: 'uni_1_k1')
    expect(payload.issuer.kid).toBe('uni_1_k1');

    // Verification queries the key corresponding to payload.issuer.kid (uniKeyV1)
    const result = verifyCredential({
      payload,
      signature: validSignature,
      publicKeyPem: uniKeyV1.publicKeyPem, // looked up by kid 'uni_1_k1'
      reveals: allReveals,
      credentialStatus: 'active',
      issuerStatus: 'active',
    });

    expect(result.outcome).toBe('valid');
    expect(result.isValid).toBe(true);

    // Verifying it against new Key 2 fails as expected
    const resultWrongKey = verifyCredential({
      payload,
      signature: validSignature,
      publicKeyPem: uniKeyV2.publicKeyPem,
      reveals: allReveals,
      credentialStatus: 'active',
      issuerStatus: 'active',
    });
    expect(resultWrongKey.outcome).toBe('invalid');
  });
});
