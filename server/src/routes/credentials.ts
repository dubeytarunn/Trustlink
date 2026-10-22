import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getDatabase } from '../db/connection';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/error-handler';
import { LogRepository } from '../db/repositories/log-repository';
import { buildSignedPayload } from '../crypto/commitments';
import { signPayload } from '../crypto/sign-verify';
import { generateCredentialId } from '../crypto/credential-id';
import { decryptPrivateKey } from '../crypto/keys';
import { toW3CVerifiableCredential } from '../crypto/w3c';
import { env } from '../config/env';
import { generateCertificatePdf } from '../services/pdf-service';

export const credentialsRouter = Router();

// ─────────────────────────────────────────────
// Public / Semi-Public Credential Status & W3C
// ─────────────────────────────────────────────

// Lightweight status check (Feature 10: GET /credentials/:id/status)
credentialsRouter.get('/:credentialId/status', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const { credentialId } = req.params;

    const cred = db.prepare(`
      SELECT c.credential_id, c.status, c.issued_at, c.expires_at, c.revoked_at, c.revoked_reason,
        c.suspended_at, c.suspended_reason,
        u.name as university_name, u.status as university_status
      FROM credentials c
      JOIN universities u ON u.id = c.university_id
      WHERE c.credential_id = ?
    `).get(credentialId) as any;

    if (!cred) {
      res.status(404).json({ error: 'Credential not found', exists: false });
      return;
    }

    const isExpired = cred.expires_at && new Date(cred.expires_at).getTime() < Date.now();
    const effectiveStatus =
      cred.status === 'revoked'
        ? 'REVOKED'
        : cred.status === 'suspended'
        ? 'SUSPENDED'
        : isExpired
        ? 'EXPIRED'
        : 'VALID';

    res.json({
      credentialId: cred.credential_id,
      status: effectiveStatus,
      rawStatus: cred.status,
      isValid: effectiveStatus === 'VALID' && cred.university_status === 'active',
      universityName: cred.university_name,
      universityAuthorized: cred.university_status === 'active',
      issuedAt: cred.issued_at,
      expiresAt: cred.expires_at,
      revokedAt: cred.revoked_at,
      revokedReason: cred.revoked_reason,
      suspendedAt: cred.suspended_at,
      suspendedReason: cred.suspended_reason,
    });
  } catch (err) { next(err); }
});

// W3C Verifiable Credential Representation (Feature 4 & 10: GET /credentials/:id/w3c)
credentialsRouter.get('/:credentialId/w3c', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const { credentialId } = req.params;

    const cred = db.prepare(`
      SELECT c.*, u.name as university_name, u.domain, u.status as university_status,
        ct.type as template_type, s.student_number
      FROM credentials c
      JOIN universities u ON u.id = c.university_id
      LEFT JOIN credential_templates ct ON ct.id = c.template_id
      LEFT JOIN students s ON s.id = c.student_id
      WHERE c.credential_id = ?
    `).get(credentialId) as any;

    if (!cred) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    const claims = JSON.parse(cred.claims_json || '{}');
    const w3cVC = toW3CVerifiableCredential({
      credentialId,
      issuerId: cred.university_id,
      issuerName: cred.university_name,
      issuerDomain: cred.domain,
      issuerStatus: cred.university_status,
      kid: cred.kid,
      credentialType: cred.template_type || 'degree',
      claims,
      studentNumber: cred.student_number,
      signature: cred.signature,
      issuedAt: cred.issued_at,
      expiresAt: cred.expires_at,
      status: cred.status,
    });

    res.json(w3cVC);
  } catch (err) { next(err); }
});

// Credential Status History (Feature 2 & 10: GET /credentials/:id/history)
credentialsRouter.get('/:credentialId/history', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const { credentialId } = req.params;

    const history = db.prepare(`
      SELECT h.*, u.email as actor_email
      FROM credential_status_history h
      LEFT JOIN users u ON u.id = h.actor_user_id
      WHERE h.credential_id = ?
      ORDER BY h.id DESC
    `).all(credentialId);

    res.json({ credentialId, history });
  } catch (err) { next(err); }
});

// Official Academic Certificate PDF (Feature: GET /credentials/:id/certificate.pdf)
credentialsRouter.get('/:credentialId/certificate.pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const { credentialId } = req.params;

    const cred = db.prepare(`
      SELECT c.*, u.name as university_name, u.domain, u.logo_url, u.status as university_status,
        ct.name as template_name, ct.type as template_type,
        s.full_name as student_name, s.student_number
      FROM credentials c
      JOIN universities u ON u.id = c.university_id
      LEFT JOIN credential_templates ct ON ct.id = c.template_id
      LEFT JOIN students s ON s.id = c.student_id
      WHERE c.credential_id = ?
    `).get(credentialId) as any;

    if (!cred) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    const claims = JSON.parse(cred.claims_json || '{}');
    const degreeTitle = claims.degree || cred.template_name || 'Academic Degree';
    const major = claims.major || claims.program || undefined;
    const graduationDate = claims.graduationYear ? `Class of ${claims.graduationYear}` : undefined;
    const verifyUrl = `${env.CLIENT_URL || 'http://localhost:5173'}/verify?id=${encodeURIComponent(credentialId)}`;

    const pdfBuffer = await generateCertificatePdf({
      credentialId,
      universityName: cred.university_name,
      universityDomain: cred.domain,
      studentName: cred.student_name || claims.studentName || 'Student',
      studentNumber: cred.student_number || claims.studentNumber,
      degreeTitle,
      major,
      graduationDate,
      issuedAt: cred.issued_at,
      payloadHash: cred.payload_hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      kid: cred.kid,
      signature: cred.signature,
      status: cred.status,
      verifyUrl,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="TrustLink-${credentialId}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

// Full Credential Details (Feature 10: GET /credentials/:id)
credentialsRouter.get('/:credentialId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const { credentialId } = req.params;

    const cred = db.prepare(`
      SELECT c.*, u.name as university_name, u.domain, u.logo_url, u.status as university_status,
        ct.name as template_name, ct.type as template_type, ct.employer_visible_claims_json,
        s.full_name as student_name, s.student_number
      FROM credentials c
      JOIN universities u ON u.id = c.university_id
      LEFT JOIN credential_templates ct ON ct.id = c.template_id
      LEFT JOIN students s ON s.id = c.student_id
      WHERE c.credential_id = ?
    `).get(credentialId) as any;

    if (!cred) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    const claims = JSON.parse(cred.claims_json || '{}');
    const employerVisible = JSON.parse(cred.employer_visible_claims_json || '[]');
    const w3cVC = toW3CVerifiableCredential({
      credentialId,
      issuerId: cred.university_id,
      issuerName: cred.university_name,
      issuerDomain: cred.domain,
      issuerStatus: cred.university_status,
      kid: cred.kid,
      credentialType: cred.template_type || 'degree',
      claims,
      studentNumber: cred.student_number,
      signature: cred.signature,
      issuedAt: cred.issued_at,
      expiresAt: cred.expires_at,
      status: cred.status,
    });

    res.json({
      credential: {
        id: cred.id,
        credentialId: cred.credential_id,
        status: cred.status,
        issuedAt: cred.issued_at,
        expiresAt: cred.expires_at,
        revokedAt: cred.revoked_at,
        revokedReason: cred.revoked_reason,
        suspendedAt: cred.suspended_at,
        suspendedReason: cred.suspended_reason,
        universityName: cred.university_name,
        universityDomain: cred.domain,
        universityStatus: cred.university_status,
        logoUrl: cred.logo_url,
        studentName: cred.student_name,
        studentNumber: cred.student_number,
        templateName: cred.template_name,
        templateType: cred.template_type || 'degree',
        claims,
        employerVisibleClaims: employerVisible,
        signature: cred.signature,
        kid: cred.kid,
      },
      w3c: w3cVC,
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// University-Protected Endpoints (Issue, Suspend, Revoke, Restore)
// ─────────────────────────────────────────────
const issueSchema = z.object({
  studentId: z.number().int().positive(),
  templateId: z.number().int().positive(),
  claims: z.record(z.unknown()),
  expiresAt: z.string().optional().nullable(),
});

// Feature 10: POST /credentials/issue
credentialsRouter.post('/issue', authenticate, requireRole('university'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const data = issueSchema.parse(req.body);
    const universityId = req.user!.universityId!;
    const logRepo = new LogRepository(db);

    const student = db.prepare('SELECT * FROM students WHERE id = ? AND university_id = ?').get(data.studentId, universityId) as any;
    if (!student) throw new AppError('NOT_FOUND', 'Student not found in your institution', 404);

    const template = db.prepare('SELECT * FROM credential_templates WHERE id = ? AND university_id = ?').get(data.templateId, universityId) as any;
    if (!template) throw new AppError('NOT_FOUND', 'Template not found', 404);

    const key = db.prepare('SELECT * FROM university_keys WHERE university_id = ? AND status = ?').get(universityId, 'active') as any;
    if (!key) throw new AppError('NO_KEY', 'No active signing key found. Please rotate/generate a key first.', 400);

    const uni = db.prepare('SELECT status, name, domain FROM universities WHERE id = ?').get(universityId) as any;
    if (uni.status !== 'active') throw new AppError('SUSPENDED', 'Your institution is currently suspended', 403);

    const credentialId = generateCredentialId();
    const issuedAt = new Date().toISOString();

    const { payload, salts } = buildSignedPayload({
      credentialId,
      issuer: { id: universityId, name: uni.name, kid: key.kid },
      credentialType: template.type,
      issuedAt,
      expiresAt: data.expiresAt ?? null,
      claimsMap: data.claims as Record<string, unknown>,
    });

    const privateKeyPem = decryptPrivateKey(key.private_key_enc, env.KEY_ENCRYPTION_SECRET);
    const signature = signPayload(payload, privateKeyPem);
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

    db.transaction(() => {
      db.prepare(`
        INSERT INTO credentials (credential_id, university_id, student_id, template_id, payload_json, signature, kid, claims_json, salts_json, payload_hash, status, issued_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(
        credentialId,
        universityId,
        data.studentId,
        data.templateId,
        JSON.stringify(payload),
        signature,
        key.kid,
        JSON.stringify(data.claims),
        JSON.stringify(salts),
        payloadHash,
        issuedAt,
        data.expiresAt ?? null
      );

      try {
        db.prepare(`
          INSERT INTO credential_status_history (credential_id, previous_status, new_status, reason, actor_user_id)
          VALUES (?, NULL, 'active', 'Initial credential issuance', ?)
        `).run(credentialId, req.user!.userId);
      } catch {}

      logRepo.appendAuditLog({
        actor_user_id: req.user!.userId,
        action: 'CREDENTIAL_ISSUED',
        entity_type: 'credential',
        entity_id: credentialId,
        details: { studentId: data.studentId, templateId: data.templateId, kid: key.kid },
      });
    })();

    res.status(201).json({ credentialId, issuedAt, signature, payload, status: 'active' });
  } catch (err) { next(err); }
});

// Feature 10: POST /credentials/:id/suspend
credentialsRouter.post('/:credentialId/suspend', authenticate, requireRole('university'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const universityId = req.user!.universityId!;
    const logRepo = new LogRepository(db);
    const { credentialId } = req.params;
    const reason = req.body?.reason ?? 'Temporarily suspended by university';

    const cred = db.prepare('SELECT id, status FROM credentials WHERE credential_id = ? AND university_id = ?').get(credentialId, universityId) as any;
    if (!cred) throw new AppError('NOT_FOUND', 'Credential not found', 404);
    if (cred.status === 'revoked') throw new AppError('ALREADY_REVOKED', 'A revoked credential cannot be suspended', 400);

    db.prepare(`
      UPDATE credentials SET status = 'suspended', suspended_reason = ?, suspended_at = datetime('now') WHERE credential_id = ?
    `).run(reason, credentialId);

    try {
      db.prepare(`
        INSERT INTO credential_status_history (credential_id, previous_status, new_status, reason, actor_user_id)
        VALUES (?, ?, 'suspended', ?, ?)
      `).run(credentialId, cred.status, reason, req.user!.userId);
    } catch {}

    logRepo.appendAuditLog({
      actor_user_id: req.user!.userId,
      action: 'CREDENTIAL_SUSPENDED',
      entity_type: 'credential',
      entity_id: credentialId,
      details: { reason },
    });

    res.json({ success: true, status: 'suspended', reason });
  } catch (err) { next(err); }
});

// Feature 10: POST /credentials/:id/revoke
credentialsRouter.post('/:credentialId/revoke', authenticate, requireRole('university'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const universityId = req.user!.universityId!;
    const logRepo = new LogRepository(db);
    const { credentialId } = req.params;
    const reason = req.body?.reason ?? 'Revoked by university';

    const cred = db.prepare('SELECT id, status FROM credentials WHERE credential_id = ? AND university_id = ?').get(credentialId, universityId) as any;
    if (!cred) throw new AppError('NOT_FOUND', 'Credential not found', 404);

    db.prepare(`
      UPDATE credentials SET status = 'revoked', revoked_reason = ?, revoked_at = datetime('now') WHERE credential_id = ?
    `).run(reason, credentialId);

    try {
      db.prepare(`
        INSERT INTO credential_status_history (credential_id, previous_status, new_status, reason, actor_user_id)
        VALUES (?, ?, 'revoked', ?, ?)
      `).run(credentialId, cred.status, reason, req.user!.userId);
    } catch {}

    logRepo.appendAuditLog({
      actor_user_id: req.user!.userId,
      action: 'CREDENTIAL_REVOKED',
      entity_type: 'credential',
      entity_id: credentialId,
      details: { reason },
    });

    res.json({ success: true, status: 'revoked' });
  } catch (err) { next(err); }
});

// Feature 10: POST /credentials/:id/restore
credentialsRouter.post('/:credentialId/restore', authenticate, requireRole('university'), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const universityId = req.user!.universityId!;
    const logRepo = new LogRepository(db);
    const { credentialId } = req.params;
    const reason = req.body?.reason ?? 'Restored to active status by university';

    const cred = db.prepare('SELECT id, status FROM credentials WHERE credential_id = ? AND university_id = ?').get(credentialId, universityId) as any;
    if (!cred) throw new AppError('NOT_FOUND', 'Credential not found', 404);
    if (cred.status === 'revoked') throw new AppError('ALREADY_REVOKED', 'A revoked credential cannot be restored', 400);

    db.prepare(`
      UPDATE credentials SET status = 'active', suspended_reason = NULL, suspended_at = NULL WHERE credential_id = ?
    `).run(credentialId);

    try {
      db.prepare(`
        INSERT INTO credential_status_history (credential_id, previous_status, new_status, reason, actor_user_id)
        VALUES (?, ?, 'active', ?, ?)
      `).run(credentialId, cred.status, reason, req.user!.userId);
    } catch {}

    logRepo.appendAuditLog({
      actor_user_id: req.user!.userId,
      action: 'CREDENTIAL_RESTORED',
      entity_type: 'credential',
      entity_id: credentialId,
      details: { reason },
    });

    res.json({ success: true, status: 'active', message: 'Credential restored successfully' });
  } catch (err) { next(err); }
});
