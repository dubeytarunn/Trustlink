/**
 * W3C Verifiable Credentials (VC) Data Model 1.1 & 2.0 Adapter
 * Seamlessly extends TrustLink credentials and selective disclosure presentations
 * into standards-compatible representations alongside the native TrustLink format.
 */

export interface W3CIssuer {
  id: string;
  name: string;
  domain?: string;
  status?: string;
  publicKeyFingerprint?: string;
}

export interface W3CCredentialSubject {
  id: string;
  [key: string]: unknown;
}

export interface W3CCredentialStatus {
  id: string;
  type: string;
  status: 'VALID' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
}

export interface W3CProof {
  type: string;
  created: string;
  proofPurpose: string;
  verificationMethod: string;
  jws: string;
}

export interface W3CVerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: W3CIssuer;
  issuanceDate: string;
  expirationDate?: string | null;
  credentialSubject: W3CCredentialSubject;
  credentialStatus: W3CCredentialStatus;
  credentialSchema: {
    id: string;
    type: string;
  };
  proof: W3CProof;
}

export interface W3CVerifiablePresentation {
  '@context': string[];
  type: string[];
  verifiableCredential: W3CVerifiableCredential[];
  selectiveDisclosureProof?: {
    type: string;
    created: string;
    proofPurpose: string;
    verificationMethod: string;
    disclosedClaims: string[];
    blindedCommitmentsCount: number;
  };
}

/**
 * Transforms an internal TrustLink credential record into a standard W3C Verifiable Credential.
 */
export function toW3CVerifiableCredential(params: {
  credentialId: string;
  issuerId: number | string;
  issuerName: string;
  issuerDomain?: string;
  issuerStatus?: string;
  kid: string;
  credentialType?: string;
  claims: Record<string, unknown>;
  studentNumber?: string;
  signature: string;
  issuedAt: string;
  expiresAt?: string | null;
  status: string;
}): W3CVerifiableCredential {
  const {
    credentialId,
    issuerId,
    issuerName,
    issuerDomain,
    issuerStatus = 'active',
    kid,
    credentialType = 'degree',
    claims,
    studentNumber,
    signature,
    issuedAt,
    expiresAt,
    status,
  } = params;

  const normalizedStatus =
    status === 'active' || status === 'valid'
      ? 'VALID'
      : status === 'suspended'
      ? 'SUSPENDED'
      : status === 'revoked'
      ? 'REVOKED'
      : 'EXPIRED';

  const typeName =
    credentialType.charAt(0).toUpperCase() + credentialType.slice(1) + 'Credential';

  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/trustlink/v1',
    ],
    id: `urn:trustlink:credential:${credentialId}`,
    type: ['VerifiableCredential', 'AcademicCredential', typeName],
    issuer: {
      id: `urn:trustlink:issuer:${issuerId}`,
      name: issuerName,
      domain: issuerDomain,
      status: issuerStatus.toUpperCase(),
      publicKeyFingerprint: kid,
    },
    issuanceDate: issuedAt,
    expirationDate: expiresAt || null,
    credentialSubject: {
      id: studentNumber ? `urn:trustlink:student:${studentNumber}` : `urn:trustlink:student:${credentialId}`,
      ...claims,
    },
    credentialStatus: {
      id: `urn:trustlink:status:${credentialId}`,
      type: 'TrustLinkCredentialStatusList2026',
      status: normalizedStatus,
    },
    credentialSchema: {
      id: 'urn:trustlink:schema:academic-credential-v1',
      type: 'JsonSchemaValidator2026',
    },
    proof: {
      type: 'JsonWebSignature2020',
      created: issuedAt,
      proofPurpose: 'assertionMethod',
      verificationMethod: `urn:trustlink:keys:${kid}`,
      jws: signature,
    },
  };
}

/**
 * Transforms a selective disclosure presentation into a W3C Verifiable Presentation.
 */
export function toW3CVerifiablePresentation(params: {
  vc: W3CVerifiableCredential;
  shareToken: string;
  disclosedClaims: string[];
  totalClaimsCount: number;
}): W3CVerifiablePresentation {
  const { vc, shareToken, disclosedClaims, totalClaimsCount } = params;

  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/trustlink/v1',
    ],
    type: ['VerifiablePresentation', 'SelectiveDisclosurePresentation'],
    verifiableCredential: [vc],
    selectiveDisclosureProof: {
      type: 'PedersenCommitmentDisclosure2026',
      created: new Date().toISOString(),
      proofPurpose: 'authentication',
      verificationMethod: `urn:trustlink:shares:${shareToken}`,
      disclosedClaims,
      blindedCommitmentsCount: Math.max(0, totalClaimsCount - disclosedClaims.length),
    },
  };
}
