import { describe, it, expect } from 'vitest';
import { generateUniversityKeyPair, decryptPrivateKey } from '../src/crypto/keys';
import { buildSignedPayload, ClaimReveal } from '../src/crypto/commitments';
import { signPayload, verifySignature, verifyCredential } from '../src/crypto/sign-verify';
import { generateCredentialId } from '../src/crypto/credential-id';

const TEST_SECRET = 'e7b89f2d1a4c3e5b6a7d8c9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90';

describe('ECDSA P-256 IEEE-P1363 Signing & Verification Engine', () => {
  const universityKey = generateUniversityKeyPair(1, 1, TEST_SECRET);
  const privateKeyPem = decryptPrivateKey(universityKey.privateKeyEnc, TEST_SECRET);

  const claims = {
    fullName: 'Tarun Dubey',
    studentNumber: '24BAI1523',
    degree: 'Bachelor of Technology',
    program: 'Computer Science & Engineering',
    major: 'Artificial Intelligence & Machine Learning',
    grade: '9.42 CGPA',
    honors: 'First Class with Distinction',
    graduationDate: '2026-07-15',
  };

  it('should successfully sign and verify a canonical payload using IEEE-P1363 encoding', () => {
    const credId = generateCredentialId();
    const { payload, salts } = buildSignedPayload({
      credentialId: credId,
      issuer: { id: 1, name: 'Vellore Institute of Technology', kid: universityKey.kid },
      credentialType: 'degree',
      issuedAt: '2026-07-18T10:00:00.000Z',
      claimsMap: claims,
    });

    const signature = signPayload(payload, privateKeyPem);
    expect(signature).toBeDefined();

    // IEEE-P1363 raw signature is 64 bytes -> base64url length is 86 or 87 characters
    const sigBuffer = Buffer.from(signature, 'base64url');
    expect(sigBuffer.length).toBe(64);

    const isSigValid = verifySignature(payload, signature, universityKey.publicKeyPem);
    expect(isSigValid).toBe(true);

    // Build reveals array for full verification
    const reveals: ClaimReveal[] = Object.entries(claims).map(([name, value]) => ({
      name,
      value,
      salt: salts[name],
    }));

    const result = verifyCredential({
      payload,
      signature,
      publicKeyPem: universityKey.publicKeyPem,
      reveals,
      credentialStatus: 'active',
      issuerStatus: 'active',
    });

    expect(result.outcome).toBe('valid');
    expect(result.isValid).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(result.commitmentsMatch).toBe(true);
  });

  it('should reject verification when signature was signed by a different university key', () => {
    const otherKey = generateUniversityKeyPair(99, 1, TEST_SECRET);
    const credId = generateCredentialId();
    const { payload, salts } = buildSignedPayload({
      credentialId: credId,
      issuer: { id: 1, name: 'Vellore Institute of Technology', kid: universityKey.kid },
      credentialType: 'degree',
      issuedAt: '2026-07-18T10:00:00.000Z',
      claimsMap: claims,
    });

    const signature = signPayload(payload, privateKeyPem);
    const reveals: ClaimReveal[] = Object.entries(claims).map(([name, value]) => ({
      name,
      value,
      salt: salts[name],
    }));

    // Verifying with wrong university key
    const result = verifyCredential({
      payload,
      signature,
      publicKeyPem: otherKey.publicKeyPem,
      reveals,
      credentialStatus: 'active',
      issuerStatus: 'active',
    });

    expect(result.outcome).toBe('invalid');
    expect(result.isValid).toBe(false);
    expect(result.signatureValid).toBe(false);
  });

  it('should report status "revoked" when credential is revoked', () => {
    const credId = generateCredentialId();
    const { payload, salts } = buildSignedPayload({
      credentialId: credId,
      issuer: { id: 1, name: 'Vellore Institute of Technology', kid: universityKey.kid },
      credentialType: 'degree',
      issuedAt: '2026-07-18T10:00:00.000Z',
      claimsMap: claims,
    });

    const signature = signPayload(payload, privateKeyPem);
    const reveals: ClaimReveal[] = Object.entries(claims).map(([name, value]) => ({
      name,
      value,
      salt: salts[name],
    }));

    const result = verifyCredential({
      payload,
      signature,
      publicKeyPem: universityKey.publicKeyPem,
      reveals,
      credentialStatus: 'revoked',
      issuerStatus: 'active',
    });

    expect(result.outcome).toBe('revoked');
    expect(result.isValid).toBe(false);
    expect(result.signatureValid).toBe(true);
  });

  it('should report status "issuer_suspended" when university is suspended', () => {
    const credId = generateCredentialId();
    const { payload, salts } = buildSignedPayload({
      credentialId: credId,
      issuer: { id: 1, name: 'Vellore Institute of Technology', kid: universityKey.kid },
      credentialType: 'degree',
      issuedAt: '2026-07-18T10:00:00.000Z',
      claimsMap: claims,
    });

    const signature = signPayload(payload, privateKeyPem);
    const reveals: ClaimReveal[] = Object.entries(claims).map(([name, value]) => ({
      name,
      value,
      salt: salts[name],
    }));

    const result = verifyCredential({
      payload,
      signature,
      publicKeyPem: universityKey.publicKeyPem,
      reveals,
      credentialStatus: 'active',
      issuerStatus: 'suspended',
    });

    expect(result.outcome).toBe('issuer_suspended');
    expect(result.isValid).toBe(false);
  });

  it('should report status "expired" when expiresAt has passed', () => {
    const credId = generateCredentialId();
    const pastDate = new Date(Date.now() - 100000).toISOString();
    const { payload, salts } = buildSignedPayload({
      credentialId: credId,
      issuer: { id: 1, name: 'Vellore Institute of Technology', kid: universityKey.kid },
      credentialType: 'certificate',
      issuedAt: '2024-01-01T00:00:00.000Z',
      expiresAt: pastDate,
      claimsMap: claims,
    });

    const signature = signPayload(payload, privateKeyPem);
    const reveals: ClaimReveal[] = Object.entries(claims).map(([name, value]) => ({
      name,
      value,
      salt: salts[name],
    }));

    const result = verifyCredential({
      payload,
      signature,
      publicKeyPem: universityKey.publicKeyPem,
      reveals,
      credentialStatus: 'active',
      issuerStatus: 'active',
      expiresAt: pastDate,
    });

    expect(result.outcome).toBe('expired');
    expect(result.isValid).toBe(false);
  });
});
