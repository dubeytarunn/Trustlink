import crypto from 'crypto';
import { canonicalBuffer } from './canonical';
import { SignedPayload, ClaimReveal, verifyClaimReveal } from './commitments';

export type VerificationOutcome =
  | 'valid'
  | 'invalid'
  | 'suspended'
  | 'revoked'
  | 'expired'
  | 'not_found'
  | 'issuer_suspended';

export interface VerificationDetails {
  outcome: VerificationOutcome;
  isValid: boolean;
  tamperedClaims: string[];
  signatureValid: boolean;
  commitmentsMatch: boolean;
  status: string;
  failureReason?: string;
}

/**
 * Signs a canonical JSON payload using ECDSA P-256 with IEEE-P1363 encoding (raw 64-byte r || s).
 * Returns signature in base64url format.
 */
export function signPayload(payload: SignedPayload, privateKeyPem: string): string {
  const dataToSign = canonicalBuffer(payload);
  const signatureBuffer = crypto.sign('sha256', dataToSign, {
    key: privateKeyPem,
    dsaEncoding: 'ieee-p1363',
  });
  return signatureBuffer.toString('base64url');
}

/**
 * Verifies an IEEE-P1363 ECDSA P-256 signature against a canonical JSON payload.
 */
export function verifySignature(payload: SignedPayload, signatureBase64Url: string, publicKeyPem: string): boolean {
  try {
    const dataToVerify = canonicalBuffer(payload);
    const signatureBuffer = Buffer.from(signatureBase64Url, 'base64url');
    return crypto.verify(
      'sha256',
      dataToVerify,
      {
        key: publicKeyPem,
        dsaEncoding: 'ieee-p1363',
      },
      signatureBuffer
    );
  } catch {
    return false;
  }
}

/**
 * Core Verification Algorithm (Section 3.5):
 * 1. Checks presented reveals against commitments in payload
 * 2. Checks signature over canonical(payload) using university's public key
 * 3. Evaluates lifecycle status (active, valid, suspended, revoked, expired, issuer suspended)
 */
export function verifyCredential(params: {
  payload: SignedPayload;
  signature: string;
  publicKeyPem: string;
  reveals: ClaimReveal[];
  credentialStatus: 'active' | 'valid' | 'suspended' | 'revoked' | 'expired' | string;
  issuerStatus: 'active' | 'suspended' | string;
  expiresAt?: string | null;
}): VerificationDetails {
  const { payload, signature, publicKeyPem, reveals, credentialStatus, issuerStatus, expiresAt } = params;

  // 1. Verify that all presented reveals match commitments in the signed payload
  const commitmentMap = new Map<string, string>();
  for (const c of payload.claims) {
    commitmentMap.set(c.name, c.commitment);
  }

  const tamperedClaims: string[] = [];
  for (const reveal of reveals) {
    const expectedCommitment = commitmentMap.get(reveal.name);
    if (!expectedCommitment || !verifyClaimReveal(reveal, expectedCommitment)) {
      tamperedClaims.push(reveal.name);
    }
  }

  const commitmentsMatch = tamperedClaims.length === 0;

  // 2. Verify digital signature over canonical payload
  const signatureValid = verifySignature(payload, signature, publicKeyPem);

  // If signature or commitments fail, it is invalid (tampered)
  if (!signatureValid || !commitmentsMatch) {
    return {
      outcome: 'invalid',
      isValid: false,
      tamperedClaims,
      signatureValid,
      commitmentsMatch,
      status: credentialStatus,
      failureReason: !commitmentsMatch
        ? `Claim commitment mismatch: ${tamperedClaims.join(', ')}`
        : 'Digital signature verification failed (tampered payload or key mismatch)',
    };
  }

  // 3. Lifecycle checks
  if (issuerStatus === 'suspended') {
    return {
      outcome: 'issuer_suspended',
      isValid: false,
      tamperedClaims: [],
      signatureValid: true,
      commitmentsMatch: true,
      status: credentialStatus,
      failureReason: 'Issuing university has been suspended',
    };
  }

  if (credentialStatus === 'revoked') {
    return {
      outcome: 'revoked',
      isValid: false,
      tamperedClaims: [],
      signatureValid: true,
      commitmentsMatch: true,
      status: 'revoked',
      failureReason: 'Credential was revoked by issuing institution',
    };
  }

  if (credentialStatus === 'suspended') {
    return {
      outcome: 'suspended',
      isValid: false,
      tamperedClaims: [],
      signatureValid: true,
      commitmentsMatch: true,
      status: 'suspended',
      failureReason: 'Credential has been temporarily suspended by issuing institution',
    };
  }

  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return {
      outcome: 'expired',
      isValid: false,
      tamperedClaims: [],
      signatureValid: true,
      commitmentsMatch: true,
      status: 'expired',
      failureReason: 'Credential validity period has expired',
    };
  }

  return {
    outcome: 'valid',
    isValid: true,
    tamperedClaims: [],
    signatureValid: true,
    commitmentsMatch: true,
    status: 'active',
  };
}
