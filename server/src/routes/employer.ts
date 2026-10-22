import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getDatabase } from '../db/connection';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/error-handler';
import { verifyCredential } from '../crypto/sign-verify';
import { LogRepository } from '../db/repositories/log-repository';

export const employerRouter = Router();

// Protect all routes with authentication and 'employer' role
employerRouter.use(authenticate);
employerRouter.use(requireRole('employer'));

// ─────────────────────────────────────────────
// Profile & Stats
// ─────────────────────────────────────────────
employerRouter.get('/profile', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;

    const employer = db.prepare(`
      SELECT e.*, u.email, u.status as user_status
      FROM employers e
      JOIN users u ON u.id = e.user_id
      WHERE e.user_id = ?
    `).get(userId) as any;

    if (!employer) {
      throw new AppError('NOT_FOUND', 'Employer profile not found', 404);
    }

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_verifications,
        SUM(CASE WHEN outcome = 'valid' THEN 1 ELSE 0 END) as valid_verifications,
        SUM(CASE WHEN outcome != 'valid' THEN 1 ELSE 0 END) as failed_verifications
      FROM verification_logs
      WHERE employer_id = ?
    `).get(employer.id) as any;

    res.json({
      employer: {
        id: employer.id,
        companyName: employer.company_name,
        emailDomain: employer.email_domain,
        officialEmail: employer.official_email,
        website: employer.website,
        status: employer.status,
        createdAt: employer.created_at,
      },
      stats: {
        total: stats.total_verifications || 0,
        valid: stats.valid_verifications || 0,
        failed: stats.failed_verifications || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// Verification History
// ─────────────────────────────────────────────
employerRouter.get('/verifications', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;

    const employer = db.prepare('SELECT id FROM employers WHERE user_id = ?').get(userId) as { id: number } | undefined;
    if (!employer) throw new AppError('NOT_FOUND', 'Employer not found', 404);

    const logs = db.prepare(`
      SELECT vl.*, c.university_id, u.name as university_name
      FROM verification_logs vl
      LEFT JOIN credentials c ON c.credential_id = vl.credential_id
      LEFT JOIN universities u ON u.id = c.university_id
      WHERE vl.employer_id = ?
      ORDER BY vl.seq DESC
      LIMIT 100
    `).all(employer.id) as any[];

    res.json({
      verifications: logs.map((l) => ({
        id: l.id,
        seq: l.seq,
        credentialId: l.credential_id,
        method: l.method,
        outcome: l.outcome,
        createdAt: l.created_at,
        universityName: l.university_name || 'Academic Institution',
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// Employer Verify (By ID or Share Link)
// ─────────────────────────────────────────────
const verifySchema = z.object({
  type: z.enum(['credential_id', 'share_token']),
  query: z.string().min(1),
  passcode: z.string().optional(),
});

employerRouter.post('/verify', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { type, query, passcode } = verifySchema.parse(req.body);

    const employer = db.prepare('SELECT id FROM employers WHERE user_id = ?').get(userId) as { id: number } | undefined;
    if (!employer) throw new AppError('NOT_FOUND', 'Employer not found', 404);

    let result: any;
    let targetCredentialId: string = '';
    let targetShareId: number | null = null;
    let universityName = '';
    let logoUrl = '';
    let disclosedClaims: any = null;

    if (type === 'credential_id') {
      const credId = query.trim();
      targetCredentialId = credId;

      const cred = db.prepare(`
        SELECT c.*, u.status as university_status, u.name as university_name, u.logo_url,
          uk.public_key_pem
        FROM credentials c
        JOIN universities u ON u.id = c.university_id
        JOIN university_keys uk ON uk.kid = c.kid
        WHERE c.credential_id = ?
      `).get(credId) as any;

      if (!cred) {
        result = { outcome: 'not_found', isValid: false, failureReason: 'Credential ID not found in registry' };
      } else {
        universityName = cred.university_name;
        logoUrl = cred.logo_url;
        const payload = JSON.parse(cred.payload_json);
        disclosedClaims = payload.claims;

        result = verifyCredential({
          payload,
          signature: cred.signature,
          publicKeyPem: cred.public_key_pem,
          reveals: [],
          credentialStatus: cred.status,
          issuerStatus: cred.university_status,
          expiresAt: cred.expires_at,
        });
      }
    } else {
      // share_token
      let token = query.trim();
      if (token.includes('/')) {
        const parts = token.split('/');
        token = parts[parts.length - 1];
      }

      const share = db.prepare(`
        SELECT sh.*, c.payload_json, c.signature, c.status as cred_status, c.expires_at,
          c.credential_id,
          u.status as university_status, u.name as university_name, u.logo_url,
          uk.public_key_pem
        FROM shares sh
        JOIN credentials c ON c.id = sh.credential_id
        JOIN universities u ON u.id = c.university_id
        JOIN university_keys uk ON uk.kid = c.kid
        WHERE sh.share_token = ?
      `).get(token) as any;

      if (!share) {
        result = { outcome: 'not_found', isValid: false, failureReason: 'Share link not found' };
      } else if (share.revoked_at) {
        result = { outcome: 'revoked', isValid: false, failureReason: 'Share link was revoked by the student' };
        targetCredentialId = share.credential_id;
        targetShareId = share.id;
      } else if (new Date(share.expires_at) < new Date()) {
        result = { outcome: 'expired', isValid: false, failureReason: 'Share link has expired' };
        targetCredentialId = share.credential_id;
        targetShareId = share.id;
      } else if (share.passcode_hash) {
        if (!passcode) {
          res.json({ requiresPasscode: true, isValid: false });
          return;
        }
        const submittedHash = crypto.createHash('sha256').update(passcode).digest('hex');
        if (submittedHash !== share.passcode_hash) {
          result = { outcome: 'invalid', isValid: false, failureReason: 'Incorrect passcode provided' };
          targetCredentialId = share.credential_id;
          targetShareId = share.id;
        } else {
          targetCredentialId = share.credential_id;
          targetShareId = share.id;
          universityName = share.university_name;
          logoUrl = share.logo_url;
          const payload = JSON.parse(share.payload_json);
          const reveals = JSON.parse(share.reveals_json);
          disclosedClaims = reveals;

          result = verifyCredential({
            payload,
            signature: share.signature,
            publicKeyPem: share.public_key_pem,
            reveals,
            credentialStatus: share.cred_status,
            issuerStatus: share.university_status,
            expiresAt: share.expires_at,
          });
          db.prepare('UPDATE shares SET view_count = view_count + 1 WHERE id = ?').run(share.id);
        }
      } else {
        targetCredentialId = share.credential_id;
        targetShareId = share.id;
        universityName = share.university_name;
        logoUrl = share.logo_url;
        const payload = JSON.parse(share.payload_json);
        const reveals = JSON.parse(share.reveals_json);
        disclosedClaims = reveals;

        result = verifyCredential({
          payload,
          signature: share.signature,
          publicKeyPem: share.public_key_pem,
          reveals,
          credentialStatus: share.cred_status,
          issuerStatus: share.university_status,
          expiresAt: share.expires_at,
        });
        db.prepare('UPDATE shares SET view_count = view_count + 1 WHERE id = ?').run(share.id);
      }
    }

    // Log verification to append-only chain
    const ipRaw = req.ip || '0.0.0.0';
    const ipHash = crypto.createHash('sha256').update(ipRaw).digest('hex').slice(0, 16);
    const lastSeq = db.prepare('SELECT COALESCE(MAX(seq), 0) as s FROM verification_logs').get() as { s: number };
    const nextSeq = lastSeq.s + 1;
    const prevHash = lastSeq.s === 0 ? '0000000000000000' : (db.prepare('SELECT entry_hash FROM verification_logs WHERE seq = ?').get(lastSeq.s) as any).entry_hash;
    const entryData = JSON.stringify({ seq: nextSeq, employerId: employer.id, targetCredentialId, outcome: result.outcome, ipHash, ts: new Date().toISOString() });
    const entryHash = crypto.createHash('sha256').update(prevHash + entryData).digest('hex');

    db.prepare(`
      INSERT INTO verification_logs (seq, verifier_type, employer_id, credential_id, share_id, method, outcome, ip_hash, user_agent, prev_hash, entry_hash)
      VALUES (?, 'employer', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(nextSeq, employer.id, targetCredentialId || null, targetShareId, type === 'credential_id' ? 'id' : 'share', result.outcome, ipHash, req.headers['user-agent'] || '', prevHash, entryHash);

    let undisclosedClaims: string[] = [];
    if (type === 'share_token' && targetShareId) {
      const shareRow = db.prepare('SELECT c.claims_json FROM shares sh JOIN credentials c ON c.id = sh.credential_id WHERE sh.id = ?').get(targetShareId) as any;
      if (shareRow?.claims_json && Array.isArray(disclosedClaims)) {
        try {
          const allClaims = JSON.parse(shareRow.claims_json);
          const disclosedKeys = disclosedClaims.map((r: any) => r.name || r);
          undisclosedClaims = Object.keys(allClaims).filter((k) => !disclosedKeys.includes(k));
        } catch {}
      }
    }

    const checks = {
      credentialIntegrity: result.commitmentsMatch ?? (result.outcome === 'valid'),
      universitySignature: result.signatureValid ?? (result.outcome === 'valid'),
      issuerAuthorization: result.outcome !== 'issuer_suspended' && result.outcome !== 'not_found',
      credentialStatus: result.outcome === 'valid',
      expiration: result.outcome !== 'expired',
      selectiveDisclosure: true,
      presentationValidity: result.outcome === 'valid',
    };

    const trustRegistry = {
      issuerName: universityName || 'Verified University',
      status: result.outcome === 'issuer_suspended' ? 'SUSPENDED' : 'ACTIVE',
      authorized: result.outcome !== 'issuer_suspended' && result.outcome !== 'not_found',
    };

    res.json({
      ...result,
      credentialId: targetCredentialId,
      universityName,
      logoUrl,
      disclosedClaims,
      undisclosedClaims,
      checks,
      trustRegistry,
    });
    return;
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// ATS Batch Credential Verification
// ─────────────────────────────────────────────
const batchVerifySchema = z.object({
  items: z.array(z.object({
    applicantId: z.string().optional(),
    candidateName: z.string().optional(),
    credentialId: z.string().min(1),
  })).min(1).max(100),
});

employerRouter.post('/batch-verify', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const { items } = batchVerifySchema.parse(req.body);

    const employer = db.prepare('SELECT id, company_name FROM employers WHERE user_id = ?').get(userId) as any;
    if (!employer) throw new AppError('NOT_FOUND', 'Employer not found', 404);

    const startTime = Date.now();
    const results = [];
    let validCount = 0;
    let failedCount = 0;
    let flaggedCount = 0;

    for (const item of items) {
      const credRow = db.prepare(`
        SELECT c.*, u.name as university_name, u.status as university_status, u.logo_url, uk.public_key_pem
        FROM credentials c
        JOIN universities u ON u.id = c.university_id
        JOIN university_keys uk ON uk.kid = c.kid
        WHERE c.credential_id = ?
      `).get(item.credentialId) as any;

      if (!credRow) {
        results.push({
          applicantId: item.applicantId || null,
          candidateName: item.candidateName || 'Unknown Candidate',
          credentialId: item.credentialId,
          universityName: 'Unregistered Institution',
          degree: 'N/A',
          major: null,
          gpa: null,
          graduationYear: null,
          outcome: 'not_found',
          isValid: false,
          signatureValid: false,
          nameMatch: false,
          riskLevel: 'HIGH',
        });
        failedCount++;
        continue;
      }

      const payload = JSON.parse(credRow.payload_json);
      const claims = JSON.parse(credRow.claims_json);

      const verifyRes = verifyCredential({
        payload,
        signature: credRow.signature,
        publicKeyPem: credRow.public_key_pem,
        reveals: [],
        credentialStatus: credRow.status,
        issuerStatus: credRow.university_status,
        expiresAt: credRow.expires_at,
      });

      let nameMatch = true;
      if (item.candidateName && claims.studentName) {
        nameMatch = item.candidateName.toLowerCase().trim() === claims.studentName.toLowerCase().trim();
      }

      let outcome: string = verifyRes.outcome;
      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

      if (!nameMatch) {
        outcome = 'name_mismatch';
        riskLevel = 'HIGH';
        flaggedCount++;
      } else if (outcome === 'valid') {
        validCount++;
        riskLevel = 'LOW';
      } else if (outcome === 'revoked' || outcome === 'suspended') {
        flaggedCount++;
        riskLevel = 'HIGH';
      } else {
        failedCount++;
        riskLevel = 'HIGH';
      }

      // Log to verification_logs
      try {
        const lastSeq = db.prepare('SELECT COALESCE(MAX(seq), 0) as s FROM verification_logs').get() as { s: number };
        const nextSeq = lastSeq.s + 1;
        const prevHash = lastSeq.s === 0 ? '0000000000000000' : (db.prepare('SELECT entry_hash FROM verification_logs WHERE seq = ?').get(lastSeq.s) as any).entry_hash;
        const entryData = JSON.stringify({ seq: nextSeq, employerId: employer.id, credId: item.credentialId, outcome, ts: new Date().toISOString() });
        const entryHash = crypto.createHash('sha256').update(prevHash + entryData).digest('hex');

        db.prepare(`
          INSERT INTO verification_logs (seq, verifier_type, employer_id, credential_id, method, outcome, ip_hash, user_agent, prev_hash, entry_hash)
          VALUES (?, 'employer', ?, ?, 'bulk', ?, '127.0.0.1', 'TrustLink-ATS/2.0', ?, ?)
        `).run(nextSeq, employer.id, item.credentialId, outcome, prevHash, entryHash);
      } catch {}

      results.push({
        applicantId: item.applicantId || null,
        candidateName: claims.studentName || item.candidateName || 'Candidate',
        credentialId: item.credentialId,
        universityName: credRow.university_name,
        degree: claims.degree || 'Degree',
        major: claims.major || null,
        gpa: claims.gpa || null,
        graduationYear: claims.graduationYear || null,
        outcome,
        isValid: outcome === 'valid',
        signatureValid: verifyRes.signatureValid,
        nameMatch,
        riskLevel,
      });
    }

    const durationMs = Date.now() - startTime;
    const batchAuditHash = crypto.createHash('sha256').update(JSON.stringify(results)).digest('hex');

    res.json({
      success: true,
      summary: {
        total: items.length,
        valid: validCount,
        flagged: flaggedCount,
        failed: failedCount,
        validRate: `${Math.round((validCount / items.length) * 100)}%`,
        durationMs,
        batchAuditHash,
        verifiedAt: new Date().toISOString(),
      },
      results,
    });
  } catch (err) {
    next(err);
  }
});

// Feature 7 & 10: Employer Credential Requests
employerRouter.get('/credential-requests', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const employer = db.prepare('SELECT id FROM employers WHERE user_id = ?').get(userId) as any;
    if (!employer) throw new AppError('NOT_FOUND', 'Employer not found', 404);

    const requests = db.prepare(`
      SELECT cr.*, e.company_name, sh.share_token, sh.expires_at as share_expires_at
      FROM credential_requests cr
      JOIN employers e ON e.id = cr.employer_id
      LEFT JOIN shares sh ON sh.share_token = cr.share_token
      WHERE cr.employer_id = ?
      ORDER BY cr.id DESC
    `).all(employer.id);

    res.json({
      requests: requests.map((r: any) => ({
        ...r,
        requestedClaims: JSON.parse(r.requested_claims_json),
      })),
    });
  } catch (err) { next(err); }
});

employerRouter.post('/credential-requests', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const employer = db.prepare('SELECT id, company_name FROM employers WHERE user_id = ?').get(userId) as any;
    if (!employer) throw new AppError('NOT_FOUND', 'Employer not found', 404);

    const schema = z.object({
      studentEmail: z.string().email(),
      credentialId: z.string().optional(),
      requestedClaims: z.array(z.string()).min(1),
      purpose: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const requestId = `REQ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    db.prepare(`
      INSERT INTO credential_requests (request_id, employer_id, student_email, credential_id, requested_claims_json, purpose, status)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(
      requestId,
      employer.id,
      data.studentEmail.toLowerCase(),
      data.credentialId || null,
      JSON.stringify(data.requestedClaims),
      data.purpose || 'Employment Verification'
    );

    const logRepo = new LogRepository(db);
    logRepo.appendAuditLog({
      actor_user_id: userId,
      action: 'CREDENTIAL_REQUEST_CREATED',
      entity_type: 'credential_request',
      entity_id: requestId,
      details: { studentEmail: data.studentEmail, requestedClaims: data.requestedClaims },
    });

    res.status(201).json({
      requestId,
      employerName: employer.company_name,
      studentEmail: data.studentEmail,
      requestedClaims: data.requestedClaims,
      status: 'PENDING',
      message: 'Credential request created successfully',
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// API Key Management (Machine Verification)
// ─────────────────────────────────────────────
employerRouter.get('/api-keys', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;

    const employer = db.prepare('SELECT id FROM employers WHERE user_id = ?').get(userId) as { id: number } | undefined;
    if (!employer) throw new AppError('NOT_FOUND', 'Employer not found', 404);

    const keys = db.prepare(`
      SELECT id, prefix, last_used_at, revoked_at, created_at
      FROM api_keys
      WHERE employer_id = ?
      ORDER BY id DESC
    `).all(employer.id);

    res.json({ keys });
  } catch (err) {
    next(err);
  }
});

employerRouter.post('/api-keys', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const logRepo = new LogRepository(db);

    const employer = db.prepare('SELECT id, company_name FROM employers WHERE user_id = ?').get(userId) as { id: number; company_name: string } | undefined;
    if (!employer) throw new AppError('NOT_FOUND', 'Employer not found', 404);

    // Generate API key: tl_live_ + 32 random hex
    const randomHex = crypto.randomBytes(16).toString('hex');
    const rawKey = `tl_live_${randomHex}`;
    const prefix = `tl_live_${randomHex.slice(0, 8)}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const info = db.prepare(`
      INSERT INTO api_keys (employer_id, prefix, key_hash)
      VALUES (?, ?, ?)
    `).run(employer.id, prefix, keyHash);

    logRepo.appendAuditLog({
      actor_user_id: userId,
      action: 'API_KEY_CREATED',
      entity_type: 'api_key',
      entity_id: String(info.lastInsertRowid),
      details: { prefix, employerId: employer.id },
    });

    res.status(201).json({
      apiKey: rawKey,
      prefix,
      id: Number(info.lastInsertRowid),
      message: 'Store this key safely. It will not be shown again.',
    });
    return;
  } catch (err) {
    next(err);
  }
});

employerRouter.delete('/api-keys/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const userId = req.user!.userId;
    const keyId = Number(req.params.id);

    const employer = db.prepare('SELECT id FROM employers WHERE user_id = ?').get(userId) as { id: number } | undefined;
    if (!employer) throw new AppError('NOT_FOUND', 'Employer not found', 404);

    db.prepare(`
      UPDATE api_keys 
      SET revoked_at = datetime('now') 
      WHERE id = ? AND employer_id = ?
    `).run(keyId, employer.id);

    res.json({ success: true, message: 'API key revoked' });
  } catch (err) {
    next(err);
  }
});
