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
import { env } from '../config/env';

export const universityRouter = Router();

universityRouter.use(authenticate);
universityRouter.use(requireRole('university'));

// ─────────────────────────────────────────────
// FR-04: Credential Templates
// ─────────────────────────────────────────────

const templateSchema = z.object({
  name: z.string().min(2),
  type: z.enum([
    'degree',
    'transcript',
    'certificate',
    'course',
    'skill',
    'certification',
    'internship',
    'achievement',
    'project',
    'micro-credential',
  ]),
  claimSchema: z.record(z.string()),
  employerVisibleClaims: z.array(z.string()),
});

universityRouter.post('/templates', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const data = templateSchema.parse(req.body);
    const universityId = req.user!.universityId!;

    const info = db.prepare(`
      INSERT INTO credential_templates (university_id, name, type, claim_schema_json, employer_visible_claims_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(universityId, data.name, data.type, JSON.stringify(data.claimSchema), JSON.stringify(data.employerVisibleClaims));

    res.status(201).json({ id: Number(info.lastInsertRowid), ...data });
  } catch (err) { next(err); }
});

universityRouter.get('/templates', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const universityId = req.user!.universityId!;
    const rows = db.prepare('SELECT * FROM credential_templates WHERE university_id = ? ORDER BY id DESC').all(universityId);
    res.json({
      templates: rows.map((r: any) => ({
        ...r,
        claimSchema: JSON.parse(r.claim_schema_json),
        employerVisibleClaims: JSON.parse(r.employer_visible_claims_json),
      })),
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// FR-02: Student Enrollment
// ─────────────────────────────────────────────

const enrollStudentSchema = z.object({
  studentNumber: z.string().min(1),
  fullName: z.string().min(2),
  email: z.string().email(),
});

universityRouter.post('/students', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const data = enrollStudentSchema.parse(req.body);
    const universityId = req.user!.universityId!;
    const logRepo = new LogRepository(db);

    const existing = db.prepare('SELECT id FROM students WHERE university_id = ? AND student_number = ?').get(universityId, data.studentNumber);
    if (existing) throw new AppError('STUDENT_EXISTS', 'A student with that number already exists', 409);

    const tx = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO students (university_id, student_number, full_name, email)
        VALUES (?, ?, ?, ?)
      `).run(universityId, data.studentNumber, data.fullName, data.email);

      const studentId = Number(info.lastInsertRowid);

      // Generate invite token (stored as hash, raw sent via dev outbox)
      const rawToken = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // 72h

      db.prepare(`
        INSERT INTO invitations (student_id, token_hash, expires_at)
        VALUES (?, ?, ?)
      `).run(studentId, tokenHash, expiresAt);

      // Dev outbox email
      const claimLink = `http://localhost:5173/claim?token=${rawToken}`;
      db.prepare(`
        INSERT INTO outbox_emails (to_email, subject, body_html) VALUES (?, ?, ?)
      `).run(
        data.email,
        `[TrustLink] Claim your student account`,
        `<p>Hi ${data.fullName},</p><p>Your university has registered you on TrustLink. <a href="${claimLink}">Claim your account</a> (expires in 72 hours).</p>`
      );

      logRepo.appendAuditLog({
        actor_user_id: req.user!.userId,
        action: 'STUDENT_ENROLLED',
        entity_type: 'student',
        entity_id: String(studentId),
        details: { studentNumber: data.studentNumber, email: data.email, universityId },
      });

      return { studentId, rawToken };
    });

    const { studentId, rawToken } = tx();
    res.status(201).json({ studentId, inviteToken: rawToken, message: 'Student enrolled and invite queued' });
  } catch (err) { next(err); }
});

universityRouter.get('/students', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const universityId = req.user!.universityId!;
    const rows = db.prepare(`
      SELECT s.*, u.email as user_email,
        (SELECT COUNT(*) FROM credentials c WHERE c.student_id = s.id) as credentials_count
      FROM students s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.university_id = ?
      ORDER BY s.id DESC
    `).all(universityId);
    res.json({ students: rows });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// FR-05 / FR-06: Issue Credential (signed w/ selective disclosure)
// ─────────────────────────────────────────────

const issueCredentialSchema = z.object({
  studentId: z.number().int().positive(),
  templateId: z.number().int().positive(),
  claims: z.record(z.unknown()),
  expiresAt: z.string().optional().nullable(),
});

universityRouter.post('/credentials', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const data = issueCredentialSchema.parse(req.body);
    const universityId = req.user!.universityId!;
    const logRepo = new LogRepository(db);

    // Security: ensure student belongs to this university
    const student = db.prepare('SELECT * FROM students WHERE id = ? AND university_id = ?').get(data.studentId, universityId) as any;
    if (!student) throw new AppError('NOT_FOUND', 'Student not found in your institution', 404);

    // Load template
    const template = db.prepare('SELECT * FROM credential_templates WHERE id = ? AND university_id = ?').get(data.templateId, universityId) as any;
    if (!template) throw new AppError('NOT_FOUND', 'Template not found', 404);

    // Load active signing key
    const key = db.prepare('SELECT * FROM university_keys WHERE university_id = ? AND status = ?').get(universityId, 'active') as any;
    if (!key) throw new AppError('NO_KEY', 'No active signing key found. Please rotate/generate a key first.', 400);

    // Check issuer is active
    const uni = db.prepare('SELECT status FROM universities WHERE id = ?').get(universityId) as any;
    if (uni.status !== 'active') throw new AppError('SUSPENDED', 'Your institution is currently suspended', 403);

    // Build credential ID and payload
    const credentialId = generateCredentialId();
    const issuedAt = new Date().toISOString();

    const { payload, salts } = buildSignedPayload({
      credentialId,
      issuer: { id: universityId, name: (uni as any).name || '', kid: key.kid },
      credentialType: template.type,
      issuedAt,
      expiresAt: data.expiresAt ?? null,
      claimsMap: data.claims as Record<string, unknown>,
    });

    // Decrypt private key and sign
    const privateKeyPem = decryptPrivateKey(key.private_key_enc, env.KEY_ENCRYPTION_SECRET);
    const signature = signPayload(payload, privateKeyPem);

    const tx = db.transaction(() => {
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
        crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
        issuedAt,
        data.expiresAt ?? null
      );

      logRepo.appendAuditLog({
        actor_user_id: req.user!.userId,
        action: 'CREDENTIAL_ISSUED',
        entity_type: 'credential',
        entity_id: credentialId,
        details: { studentId: data.studentId, templateId: data.templateId, kid: key.kid },
      });
    });

    tx();
    res.status(201).json({ credentialId, issuedAt, signature, payload });
  } catch (err) { next(err); }
});

universityRouter.get('/credentials', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const universityId = req.user!.universityId!;
    const rows = db.prepare(`
      SELECT c.*, s.full_name as student_name, s.student_number, t.name as template_name, t.type as credential_type
      FROM credentials c
      JOIN students s ON s.id = c.student_id
      LEFT JOIN credential_templates t ON t.id = c.template_id
      WHERE c.university_id = ?
      ORDER BY c.id DESC
    `).all(universityId);
    res.json({
      credentials: rows.map((r: any) => ({
        ...r,
        payload: JSON.parse(r.payload_json),
      })),
    });
  } catch (err) { next(err); }
});

// FR-08: Revoke a credential
universityRouter.post('/credentials/:credentialId/revoke', (req: Request, res: Response, next: NextFunction) => {
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

// Feature 2: Suspend a credential
universityRouter.post('/credentials/:credentialId/suspend', (req: Request, res: Response, next: NextFunction) => {
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

// Feature 2: Restore a suspended credential
universityRouter.post('/credentials/:credentialId/restore', (req: Request, res: Response, next: NextFunction) => {
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

// Feature 2: Status history
universityRouter.get('/credentials/:credentialId/history', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const universityId = req.user!.universityId!;
    const { credentialId } = req.params;

    const cred = db.prepare('SELECT id FROM credentials WHERE credential_id = ? AND university_id = ?').get(credentialId, universityId);
    if (!cred) throw new AppError('NOT_FOUND', 'Credential not found', 404);

    const history = db.prepare(`
      SELECT h.*, u.email as actor_email
      FROM credential_status_history h
      LEFT JOIN users u ON u.id = h.actor_user_id
      WHERE h.credential_id = ?
      ORDER BY h.id DESC
    `).all(credentialId);

    res.json({ history });
  } catch (err) { next(err); }
});

