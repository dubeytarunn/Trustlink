import { describe, it, expect } from 'vitest';
import { generateUniversityKeyPair, decryptPrivateKey } from '../src/crypto/keys';
import { buildSignedPayload, ClaimReveal } from '../src/crypto/commitments';
import { signPayload, verifyCredential } from '../src/crypto/sign-verify';
import { generateCredentialId } from '../src/crypto/credential-id';

const TEST_SECRET = 'e7b89f2d1a4c3e5b6a7d8c9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90';

describe('Selective Disclosure Cryptographic Verification (FR-15 to FR-18)', () => {
  const universityKey = generateUniversityKeyPair(1, 1, TEST_SECRET);
  const privateKeyPem = decryptPrivateKey(universityKey.privateKeyEnc, TEST_SECRET);

  const fullClaims = {
    fullName: 'Tarun Dubey',
    studentNumber: '24BAI1523',
    degree: 'Bachelor of Technology',
    program: 'Computer Science & Engineering',
    grade: '6.80 CGPA', // Student wishes to conceal this
    graduationDate: '2026-07-15',
  };

  const credId = generateCredentialId();
  const { payload, salts } = buildSignedPayload({
    credentialId: credId,
    issuer: { id: 1, name: 'Vellore Institute of Technology', kid: universityKey.kid },
    credentialType: 'degree',
    issuedAt: '2026-07-18T10:00:00.000Z',
    claimsMap: fullClaims,
  });

  const signature = signPayload(payload, privateKeyPem);

  it('should successfully verify when student selectively discloses only degree and graduationDate (FR-17)', () => {
    // Disclosing only subset: degree and graduationDate
    const disclosedReveals: ClaimReveal[] = [
      { name: 'degree', value: fullClaims.degree, salt: salts['degree'] },
      { name: 'graduationDate', value: fullClaims.graduationDate, salt: salts['graduationDate'] },
    ];

    const result = verifyCredential({
      payload,
      signature,
      publicKeyPem: universityKey.publicKeyPem,
      reveals: disclosedReveals,
      credentialStatus: 'active',
      issuerStatus: 'active',
    });

    expect(result.outcome).toBe('valid');
    expect(result.isValid).toBe(true);
    expect(result.commitmentsMatch).toBe(true);
    expect(result.signatureValid).toBe(true);
  });

  it('should fail verification if student or verifier attempts to alter a disclosed value (FR-18)', () => {
    // Attempting to tamper degree from B.Tech to Master of Science
    const tamperedReveals: ClaimReveal[] = [
      { name: 'degree', value: 'Master of Science in Artificial Intelligence', salt: salts['degree'] },
      { name: 'graduationDate', value: fullClaims.graduationDate, salt: salts['graduationDate'] },
    ];

    const result = verifyCredential({
      payload,
      signature,
      publicKeyPem: universityKey.publicKeyPem,
      reveals: tamperedReveals,
      credentialStatus: 'active',
      issuerStatus: 'active',
    });

    expect(result.outcome).toBe('invalid');
    expect(result.isValid).toBe(false);
    expect(result.tamperedClaims).toContain('degree');
    expect(result.failureReason).toContain('degree');
  });

  it('should fail verification if someone attempts to inject an invented or arbitrary claim', () => {
    const injectedReveals: ClaimReveal[] = [
      { name: 'degree', value: fullClaims.degree, salt: salts['degree'] },
      { name: 'fakeAward', value: 'Gold Medalist', salt: 'arbitrary_salt_123' },
    ];

    const result = verifyCredential({
      payload,
      signature,
      publicKeyPem: universityKey.publicKeyPem,
      reveals: injectedReveals,
      credentialStatus: 'active',
      issuerStatus: 'active',
    });

    expect(result.outcome).toBe('invalid');
    expect(result.isValid).toBe(false);
    expect(result.tamperedClaims).toContain('fakeAward');
  });
});
