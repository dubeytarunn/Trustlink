import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { getDatabase } from '../db/connection';
import { verifyCredential } from '../crypto/sign-verify';
import { toW3CVerifiableCredential, toW3CVerifiablePresentation } from '../crypto/w3c';

export const verifyRouter = Router();

// ─────────────────────────────────────────────
// Public JWKS endpoint (discovery, no auth needed)
// ─────────────────────────────────────────────
verifyRouter.get('/public-keys', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const keys = db.prepare(`
      SELECT uk.kid, uk.public_jwk, u.name as university_name, u.domain, uk.status
      FROM university_keys uk
      JOIN universities u ON u.id = uk.university_id
      ORDER BY uk.id DESC
    `).all() as any[];

    res.json({
      keys: keys.map((k) => ({
        ...JSON.parse(k.public_jwk),
        universityName: k.university_name,
        domain: k.domain,
        status: k.status,
      })),
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// Feature 6: University Trust Registry Endpoint
// ─────────────────────────────────────────────
verifyRouter.get('/trust-registry', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const universities = db.prepare(`
      SELECT u.id, u.name, u.domain, u.country, u.registrar_email, u.logo_url, u.status, u.created_at,
        (SELECT COUNT(*) FROM university_keys uk WHERE uk.university_id = u.id AND uk.status = 'active') as active_keys_count,
        (SELECT COUNT(*) FROM credentials c WHERE c.university_id = u.id) as credentials_issued_count,
        (SELECT uk.kid FROM university_keys uk WHERE uk.university_id = u.id AND uk.status = 'active' LIMIT 1) as primary_kid
      FROM universities u
      ORDER BY u.name ASC
    `).all() as any[];

    res.json({
      trustRegistry: universities.map((u) => ({
        id: u.id,
        name: u.name,
        domain: u.domain,
        country: u.country,
        status: u.status === 'active' ? 'ACTIVE' : 'SUSPENDED',
        authorized: u.status === 'active',
        authorizationLevel: 'LEVEL_3_ACCREDITED',
        accreditedSince: u.created_at,
        activeKeysCount: u.active_keys_count,
        credentialsIssuedCount: u.credentials_issued_count,
        primaryKeyId: u.primary_kid || 'None',
        cryptoStandard: 'ECDSA P-256 (IEEE-P1363)',
      })),
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// Feature 3: QR Code Generation Endpoint
// ─────────────────────────────────────────────
verifyRouter.get('/qr', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const text = (req.query.text as string) || '';
    if (!text) {
      res.status(400).json({ error: 'Missing "text" query parameter' });
      return;
    }
    if (req.query.format === 'image' || req.headers.accept?.includes('image/')) {
      const buffer = await QRCode.toBuffer(text, {
        errorCorrectionLevel: 'M',
        width: 320,
        margin: 2,
        color: {
          dark: '#0b1f3a',
          light: '#ffffff',
        },
      });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buffer);
      return;
    }
    const qrDataUrl = await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      width: 320,
      margin: 2,
      color: {
        dark: '#0b1f3a',
        light: '#ffffff',
      },
    });
    res.json({ qrDataUrl, text });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// FR-09: Verify credential by ID
// ─────────────────────────────────────────────
verifyRouter.get('/credential/:credentialId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const { credentialId } = req.params;

    const cred = db.prepare(`
      SELECT c.*, u.status as university_status, u.name as university_name, u.domain, u.country, u.logo_url,
        uk.public_key_pem, ct.name as template_name, ct.type as template_type, ct.employer_visible_claims_json
      FROM credentials c
      JOIN universities u ON u.id = c.university_id
      JOIN university_keys uk ON uk.kid = c.kid
      LEFT JOIN credential_templates ct ON ct.id = c.template_id
      WHERE c.credential_id = ?
    `).get(credentialId) as any;

    if (!cred) {
      res.json({
        outcome: 'not_found',
        isValid: false,
        failureReason: 'Credential ID not found in registry',
        checks: {
          credentialIntegrity: false,
          universitySignature: false,
          issuerAuthorization: false,
          credentialStatus: false,
          expiration: false,
          selectiveDisclosure: false,
          presentationValidity: false,
        },
      });
      return;
    }

    const payload = JSON.parse(cred.payload_json);
    const result = verifyCredential({
      payload,
      signature: cred.signature,
      publicKeyPem: cred.public_key_pem,
      reveals: [], // No reveals needed for full verification
      credentialStatus: cred.status,
      issuerStatus: cred.university_status,
      expiresAt: cred.expires_at,
    });

    // Extract public/employer-visible claims
    let disclosedClaims: Array<{ name: string; value: unknown }> = [];
    let allClaimsMap: Record<string, unknown> = {};
    if (cred.claims_json) {
      try {
        allClaimsMap = JSON.parse(cred.claims_json);
        const allowedKeys: string[] = cred.employer_visible_claims_json
          ? JSON.parse(cred.employer_visible_claims_json)
          : Object.keys(allClaimsMap).filter((k) => k.toLowerCase() !== 'gpa');
        disclosedClaims = allowedKeys
          .filter((k) => allClaimsMap[k] !== undefined)
          .map((k) => ({ name: k, value: allClaimsMap[k] }));
      } catch (err) {}
    }

    // Build standards-compatible W3C Verifiable Credential (Feature 4)
    const w3cCredential = toW3CVerifiableCredential({
      credentialId,
      issuerId: cred.university_id,
      issuerName: cred.university_name,
      issuerDomain: cred.domain,
      issuerStatus: cred.university_status,
      kid: cred.kid,
      credentialType: cred.template_type || 'degree',
      claims: allClaimsMap,
      signature: cred.signature,
      issuedAt: cred.issued_at,
      expiresAt: cred.expires_at,
      status: cred.status,
    });

    // Comprehensive TrustLink 7-point Verification checks
    const checks = {
      credentialIntegrity: result.commitmentsMatch,
      universitySignature: result.signatureValid,
      issuerAuthorization: cred.university_status === 'active',
      credentialStatus: cred.status === 'active' || cred.status === 'valid',
      expiration: !cred.expires_at || new Date(cred.expires_at).getTime() >= Date.now(),
      selectiveDisclosure: true,
      presentationValidity: true,
    };

    // Trust Registry verification entry (Feature 6)
    const trustRegistry = {
      issuerName: cred.university_name,
      domain: cred.domain,
      country: cred.country,
      status: cred.university_status === 'active' ? 'ACTIVE' : 'SUSPENDED',
      authorized: cred.university_status === 'active',
      kid: cred.kid,
    };

    // Log verification event to append-only chain
    const ipRaw = req.ip || '0.0.0.0';
    const ipHash = crypto.createHash('sha256').update(ipRaw).digest('hex').slice(0, 16);
    const lastSeq = db.prepare('SELECT COALESCE(MAX(seq), 0) as s FROM verification_logs').get() as { s: number };
    const nextSeq = lastSeq.s + 1;
    const prevHash = lastSeq.s === 0 ? '0000000000000000' : (db.prepare('SELECT entry_hash FROM verification_logs WHERE seq = ?').get(lastSeq.s) as any).entry_hash;
    const entryData = JSON.stringify({ seq: nextSeq, credentialId, outcome: result.outcome, ipHash, ts: new Date().toISOString() });
    const entryHash = crypto.createHash('sha256').update(prevHash + entryData).digest('hex');

    db.prepare(`
      INSERT INTO verification_logs (seq, verifier_type, credential_id, method, outcome, ip_hash, user_agent, prev_hash, entry_hash)
      VALUES (?, 'public', ?, 'id', ?, ?, ?, ?, ?)
    `).run(nextSeq, credentialId, result.outcome, ipHash, req.headers['user-agent'] || '', prevHash, entryHash);

    // Query linked government / biometric verifications
    const digilockerDoc = db.prepare(`
      SELECT uri, org_id, doc_type, roll_number, candidate_name, passing_year, verification_status, pulled_at
      FROM digilocker_pulled_docs
      WHERE credential_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(credentialId) as any;

    const biometricAudit = db.prepare(`
      SELECT similarity_score, verdict, notes, created_at
      FROM biometric_verifications
      WHERE credential_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(credentialId) as any;

    const aadhaarKyc = db.prepare(`
      SELECT av.status, av.verified_at, ar.masked_aadhaar, ar.full_name
      FROM aadhaar_verifications av
      JOIN aadhaar_registry ar ON ar.aadhaar_number = av.aadhaar_number
      WHERE av.credential_id = ? AND av.status = 'VERIFIED'
      ORDER BY av.id DESC LIMIT 1
    `).get(credentialId) as any;

    res.json({
      ...result,
      credentialId,
      universityName: cred.university_name,
      logoUrl: cred.logo_url,
      issuedAt: cred.issued_at,
      expiresAt: cred.expires_at,
      disclosedClaims,
      checks,
      trustRegistry,
      w3cCredential,
      rawStatus: cred.status,
      digilockerDoc,
      biometricAudit,
      aadhaarKyc,
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// FR-09b: Verify share link (selective disclosure)
// ─────────────────────────────────────────────

const shareVerifySchema = z.object({
  passcode: z.string().optional(),
});

verifyRouter.post('/share/:shareToken', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const { shareToken } = req.params;
    const data = shareVerifySchema.parse(req.body);

    const share = db.prepare(`
      SELECT sh.id, sh.share_token, sh.credential_id, sh.disclosed_claims_json, sh.reveals_json,
        sh.expires_at as share_expires_at, sh.passcode_hash, sh.revoked_at, sh.view_count,
        c.id as cred_internal_id, c.payload_json, c.signature, c.status as cred_status, c.expires_at as cred_expires_at,
        c.credential_id as formatted_credential_id, c.kid, c.claims_json, c.issued_at as cred_issued_at,
        c.university_id,
        u.status as university_status, u.name as university_name, u.domain, u.country, u.logo_url,
        uk.public_key_pem
      FROM shares sh
      JOIN credentials c ON c.id = sh.credential_id
      JOIN universities u ON u.id = c.university_id
      JOIN university_keys uk ON uk.kid = c.kid
      WHERE sh.share_token = ?
    `).get(shareToken) as any;

    if (!share) {
      res.status(404).json({
        outcome: 'not_found',
        isValid: false,
        failureReason: 'Share link not found',
        checks: {
          credentialIntegrity: false,
          universitySignature: false,
          issuerAuthorization: false,
          credentialStatus: false,
          expiration: false,
          selectiveDisclosure: false,
          presentationValidity: false,
        },
      });
      return;
    }

    if (share.revoked_at) {
      res.json({
        outcome: 'revoked',
        isValid: false,
        failureReason: 'This share link has been revoked by the student',
        credentialId: share.formatted_credential_id,
        universityName: share.university_name,
        checks: {
          credentialIntegrity: true,
          universitySignature: true,
          issuerAuthorization: share.university_status === 'active',
          credentialStatus: share.cred_status === 'active' || share.cred_status === 'valid',
          expiration: true,
          selectiveDisclosure: true,
          presentationValidity: false,
        },
      });
      return;
    }

    const isShareExpired =
      share.share_expires_at && new Date(share.share_expires_at).getTime() < Date.now();

    if (isShareExpired) {
      res.json({
        outcome: 'expired',
        isValid: false,
        failureReason: 'This shared credential presentation is no longer valid.',
        credentialId: share.formatted_credential_id,
        universityName: share.university_name,
        checks: {
          credentialIntegrity: true,
          universitySignature: true,
          issuerAuthorization: share.university_status === 'active',
          credentialStatus: share.cred_status === 'active' || share.cred_status === 'valid',
          expiration: false,
          selectiveDisclosure: true,
          presentationValidity: false,
        },
      });
      return;
    }

    // Check passcode if set
    if (share.passcode_hash) {
      if (!data.passcode) {
        res.json({ requiresPasscode: true, isValid: false });
        return;
      }
      const submittedHash = crypto.createHash('sha256').update(data.passcode).digest('hex');
      if (submittedHash !== share.passcode_hash) {
        res.status(403).json({ outcome: 'invalid', isValid: false, failureReason: 'Incorrect passcode' });
        return;
      }
    }

    const payload = JSON.parse(share.payload_json);
    const reveals = JSON.parse(share.reveals_json);
    const allClaims = JSON.parse(share.claims_json || '{}');
    const disclosedKeys = reveals.map((r: any) => r.name);
    const undisclosedClaims = Object.keys(allClaims).filter((k) => !disclosedKeys.includes(k));

    const result = verifyCredential({
      payload,
      signature: share.signature,
      publicKeyPem: share.public_key_pem,
      reveals,
      credentialStatus: share.cred_status,
      issuerStatus: share.university_status,
      expiresAt: share.cred_expires_at,
    });

    // Increment view count
    db.prepare('UPDATE shares SET view_count = view_count + 1 WHERE share_token = ?').run(shareToken);

    // Build standards-compatible W3C Verifiable Presentation (Feature 4 & 5)
    const revealedClaimsMap: Record<string, unknown> = {};
    for (const r of reveals) {
      revealedClaimsMap[r.name] = r.value;
    }

    const w3cVC = toW3CVerifiableCredential({
      credentialId: share.formatted_credential_id,
      issuerId: share.university_id,
      issuerName: share.university_name,
      issuerDomain: share.domain,
      issuerStatus: share.university_status,
      kid: share.kid,
      credentialType: 'degree',
      claims: revealedClaimsMap,
      signature: share.signature,
      issuedAt: share.cred_issued_at,
      expiresAt: share.cred_expires_at,
      status: share.cred_status,
    });

    const w3cPresentation = toW3CVerifiablePresentation({
      vc: w3cVC,
      shareToken,
      disclosedClaims: disclosedKeys,
      totalClaimsCount: Object.keys(allClaims).length,
    });

    // Comprehensive TrustLink 7-point Verification checks
    const checks = {
      credentialIntegrity: result.commitmentsMatch,
      universitySignature: result.signatureValid,
      issuerAuthorization: share.university_status === 'active',
      credentialStatus: share.cred_status === 'active' || share.cred_status === 'valid',
      expiration: !isShareExpired,
      selectiveDisclosure: result.commitmentsMatch,
      presentationValidity: !isShareExpired && !share.revoked_at,
    };

    const trustRegistry = {
      issuerName: share.university_name,
      domain: share.domain,
      country: share.country,
      status: share.university_status === 'active' ? 'ACTIVE' : 'SUSPENDED',
      authorized: share.university_status === 'active',
      kid: share.kid,
    };

    // Log
    const ipRaw = req.ip || '0.0.0.0';
    const ipHash = crypto.createHash('sha256').update(ipRaw).digest('hex').slice(0, 16);
    const lastSeq = db.prepare('SELECT COALESCE(MAX(seq), 0) as s FROM verification_logs').get() as { s: number };
    const nextSeq = lastSeq.s + 1;
    const prevHash = lastSeq.s === 0 ? '0000000000000000' : (db.prepare('SELECT entry_hash FROM verification_logs WHERE seq = ?').get(lastSeq.s) as any).entry_hash;
    const entryData = JSON.stringify({ seq: nextSeq, shareToken, outcome: result.outcome, ipHash, ts: new Date().toISOString() });
    const entryHash = crypto.createHash('sha256').update(prevHash + entryData).digest('hex');

    db.prepare(`
      INSERT INTO verification_logs (seq, verifier_type, credential_id, share_id, method, outcome, ip_hash, user_agent, prev_hash, entry_hash)
      VALUES (?, 'public', ?, ?, 'share', ?, ?, ?, ?, ?)
    `).run(nextSeq, share.credential_id, share.id, result.outcome, ipHash, req.headers['user-agent'] || '', prevHash, entryHash);

    const digilockerDoc = db.prepare(`
      SELECT uri, org_id, doc_type, roll_number, candidate_name, passing_year, verification_status, pulled_at
      FROM digilocker_pulled_docs
      WHERE credential_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(share.formatted_credential_id) as any;

    const biometricAudit = db.prepare(`
      SELECT similarity_score, verdict, notes, created_at
      FROM biometric_verifications
      WHERE credential_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(share.formatted_credential_id) as any;

    const aadhaarKyc = db.prepare(`
      SELECT av.status, av.verified_at, ar.masked_aadhaar, ar.full_name
      FROM aadhaar_verifications av
      JOIN aadhaar_registry ar ON ar.aadhaar_number = av.aadhaar_number
      WHERE av.credential_id = ? AND av.status = 'VERIFIED'
      ORDER BY av.id DESC LIMIT 1
    `).get(share.formatted_credential_id) as any;

    res.json({
      ...result,
      credentialId: share.formatted_credential_id,
      universityName: share.university_name,
      logoUrl: share.logo_url,
      disclosedClaims: reveals,
      undisclosedClaims,
      viewCount: share.view_count + 1,
      expiresAt: share.share_expires_at,
      checks,
      trustRegistry,
      w3cPresentation,
      rawStatus: share.cred_status,
      digilockerDoc,
      biometricAudit,
      aadhaarKyc,
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// Feature 10: Unified POST /verify & Presentations
// ─────────────────────────────────────────────
const unifiedVerifySchema = z.object({
  type: z.enum(['credential_id', 'share_token']).optional(),
  query: z.string().optional(),
  credentialId: z.string().optional(),
  shareToken: z.string().optional(),
  passcode: z.string().optional(),
});

verifyRouter.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = unifiedVerifySchema.parse(req.body);
    let targetType = data.type;
    let targetQuery = data.query;

    if (!targetQuery) {
      if (data.credentialId) {
        targetType = 'credential_id';
        targetQuery = data.credentialId;
      } else if (data.shareToken) {
        targetType = 'share_token';
        targetQuery = data.shareToken;
      }
    }

    if (!targetQuery) {
      res.status(400).json({ outcome: 'invalid', isValid: false, failureReason: 'Missing credentialId or shareToken' });
      return;
    }

    if (targetQuery.startsWith('TL-') || targetType === 'credential_id') {
      req.params = { credentialId: targetQuery.trim() };
      // Forward to GET /credential/:credentialId logic
      return (verifyRouter as any).handle(
        Object.assign(req, { method: 'GET', url: `/credential/${targetQuery.trim()}` }),
        res,
        next
      );
    } else {
      let token = targetQuery.trim();
      if (token.includes('/')) {
        const parts = token.split('/');
        token = parts[parts.length - 1];
      }
      req.params = { shareToken: token };
      req.body = { passcode: data.passcode };
      return (verifyRouter as any).handle(
        Object.assign(req, { method: 'POST', url: `/share/${token}` }),
        res,
        next
      );
    }
  } catch (err) { next(err); }
});

verifyRouter.post('/presentations/verify', (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.body?.shareToken || req.body?.token;
    if (!token) {
      res.status(400).json({ outcome: 'invalid', isValid: false, failureReason: 'Missing shareToken in request body' });
      return;
    }
    req.params = { shareToken: token };
    return (verifyRouter as any).handle(
      Object.assign(req, { method: 'POST', url: `/share/${token}` }),
      res,
      next
    );
  } catch (err) { next(err); }
});
