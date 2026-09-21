import crypto from 'crypto';
import { canonicalBuffer } from './canonical';

export interface ClaimCommitment {
  name: string;
  commitment: string;
}

export interface ClaimReveal {
  name: string;
  value: unknown;
  salt: string;
}

export interface CredentialIssuer {
  id: number | string;
  name: string;
  kid: string;
}

export interface SignedPayload {
  schemaVersion: '1.0';
  credentialId: string;
  issuer: CredentialIssuer;
  credentialType: string;
  issuedAt: string;
  expiresAt: string | null;
  claims: ClaimCommitment[];
}

/**
 * Generates a 128-bit (16 bytes) cryptographically random salt, base64url-encoded.
 */
export function generateSalt(): string {
  return crypto.randomBytes(16).toString('base64url');
}

/**
 * Computes a claim commitment:
 * commitment_i = base64url( SHA-256( canonical([salt_i, claimName_i, claimValue_i]) ) )
 */
export function computeClaimCommitment(salt: string, claimName: string, claimValue: unknown): string {
  const dataToHash = canonicalBuffer([salt, claimName, claimValue]);
  return crypto.createHash('sha256').update(dataToHash).digest('base64url');
}

/**
 * Builds the signed payload containing ONLY metadata and sorted list of claim commitments.
 * Note: Raw values are strictly excluded from this payload!
 */
export function buildSignedPayload(params: {
  credentialId: string;
  issuer: CredentialIssuer;
  credentialType: string;
  issuedAt: string;
  expiresAt?: string | null;
  claimsMap: Record<string, unknown>;
  saltsMap?: Record<string, string>;
}): {
  payload: SignedPayload;
  salts: Record<string, string>;
} {
  const { credentialId, issuer, credentialType, issuedAt, expiresAt = null, claimsMap } = params;

  const salts: Record<string, string> = params.saltsMap ? { ...params.saltsMap } : {};
  const commitments: ClaimCommitment[] = [];

  for (const [name, value] of Object.entries(claimsMap)) {
    if (!salts[name]) {
      salts[name] = generateSalt();
    }
    const commitment = computeClaimCommitment(salts[name], name, value);
    commitments.push({ name, commitment });
  }

  // Sort claims array lexicographically by claim name
  commitments.sort((a, b) => a.name.localeCompare(b.name));

  const payload: SignedPayload = {
    schemaVersion: '1.0',
    credentialId,
    issuer,
    credentialType,
    issuedAt,
    expiresAt,
    claims: commitments,
  };

  return { payload, salts };
}

/**
 * Verifies that a presented reveal (salt, name, value) matches a commitment in the payload.
 */
export function verifyClaimReveal(reveal: ClaimReveal, expectedCommitment: string): boolean {
  const computed = computeClaimCommitment(reveal.salt, reveal.name, reveal.value);
  return computed === expectedCommitment;
}
