import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getDatabase } from '../db/connection';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/error-handler';
import { hashPassword } from '../crypto/password';
import { toW3CVerifiableCredential } from '../crypto/w3c';

export const studentRouter = Router();

// ─────────────────────────────────────────────
// FR-03: Account Claim (invite token → set password)
// ─────────────────────────────────────────────

const claimSchema = z.object({
  token: z.string().min(10),
  email: z.string().email(),
  password: z.string().min(8),
});

studentRouter.post('/claim', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const data = claimSchema.parse(req.body);

    const tokenHash = crypto.createHash('sha256').update(data.token).digest('hex');
    const invitation = db.prepare(`
      SELECT i.*, s.email as student_email, s.university_id, s.id as student_id, s.full_name
      FROM invitations i
      JOIN students s ON s.id = i.student_id
      WHERE i.token_hash = ? AND i.claimed_at IS NULL
    `).get(tokenHash) as any;

    if (!invitation) throw new AppError('INVALID_TOKEN', 'Invalid or already-used invitation token', 400);
    if (new Date(invitation.expires_at) < new Date()) throw new AppError('TOKEN_EXPIRED', 'Invitation token has expired', 400);
    if (invitation.student_email.toLowerCase() !== data.email.toLowerCase()) {
      throw new AppError('EMAIL_MISMATCH', 'Email does not match invitation', 400);
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(data.email.toLowerCase());
    if (existingUser) throw new AppError('EMAIL_TAKEN', 'An account with this email already exists', 409);

    const passwordHash = await hashPassword(data.password);

    const tx = db.transaction(() => {
      const userInfo = db.prepare(`
        INSERT INTO users (email, password_hash, role, university_id, status)
        VALUES (?, ?, 'student', ?, 'active')
      `).run(data.email.toLowerCase(), passwordHash, invitation.university_id);

      const userId = Number(userInfo.lastInsertRowid);

      db.prepare('UPDATE students SET user_id = ? WHERE id = ?').run(userId, invitation.student_id);
      db.prepare(`UPDATE invitations SET claimed_at = datetime('now') WHERE token_hash = ?`).run(tokenHash);

      return userId;
    });

    tx();
    res.json({ success: true, message: 'Account claimed successfully. You can now log in.' });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// Protected student endpoints (require auth)
// ─────────────────────────────────────────────
studentRouter.use(authenticate);
studentRouter.use(requireRole('student'));

// Get current student profile + credentials
studentRouter.get('/me', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const student = db.prepare(`
      SELECT s.*, u.name as university_name, u.domain, u.logo_url
      FROM students s
      JOIN universities u ON u.id = s.university_id
      WHERE s.user_id = ?
    `).get(req.user!.userId) as any;

    if (!student) throw new AppError('NOT_FOUND', 'Student profile not found', 404);
    res.json({ student });
  } catch (err) { next(err); }
});

studentRouter.get('/credentials', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(req.user!.userId) as any;
    if (!student) throw new AppError('NOT_FOUND', 'Student not found', 404);

    const credentials = db.prepare(`
      SELECT c.*, t.name as template_name, t.type as template_type, t.employer_visible_claims_json,
        u.name as university_name, u.domain, u.status as university_status, u.logo_url,
        s.student_number
      FROM credentials c
      LEFT JOIN credential_templates t ON t.id = c.template_id
      JOIN universities u ON u.id = c.university_id
      JOIN students s ON s.id = c.student_id
      WHERE c.student_id = ?
      ORDER BY c.id DESC
    `).all(student.id) as any[];

    res.json({
      credentials: credentials.map((c) => {
        const claims = JSON.parse(c.claims_json || '{}');
        const employerVisibleClaims = JSON.parse(c.employer_visible_claims_json || '[]');
        return {
          ...c,
          payload: JSON.parse(c.payload_json),
          claims,
          employerVisibleClaims,
          w3c: toW3CVerifiableCredential({
            credentialId: c.credential_id,
            issuerId: c.university_id,
            issuerName: c.university_name,
            issuerDomain: c.domain,
            issuerStatus: c.university_status,
            kid: c.kid,
            credentialType: c.template_type || 'degree',
            claims,
            studentNumber: c.student_number,
            signature: c.signature,
            issuedAt: c.issued_at,
            expiresAt: c.expires_at,
            status: c.status,
          }),
        };
      }),
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// FR-07: Create Selective Disclosure Share Link
// ─────────────────────────────────────────────

const shareSchema = z.object({
  credentialId: z.string(),
  disclosedClaims: z.array(z.string()),
  expiresInHours: z.number().int().min(0).max(87600).default(72),
  passcode: z.string().optional(),
});

studentRouter.post('/shares', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const data = shareSchema.parse(req.body);

    // Ensure student owns this credential
    const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(req.user!.userId) as any;
    if (!student) throw new AppError('NOT_FOUND', 'Student not found', 404);

    const credential = db.prepare(`
      SELECT c.*, t.employer_visible_claims_json
      FROM credentials c
      LEFT JOIN credential_templates t ON t.id = c.template_id
      WHERE c.credential_id = ? AND c.student_id = ?
    `).get(data.credentialId, student.id) as any;
    if (!credential) throw new AppError('NOT_FOUND', 'Credential not found', 404);
    if (credential.status === 'suspended') {
      throw new AppError('SUSPENDED', 'This credential is currently suspended by your institution and cannot be shared.', 400);
    }
    if (credential.status === 'revoked') {
      throw new AppError('REVOKED', 'This credential was revoked by your institution and cannot be shared.', 400);
    }

    const allClaims: Record<string, unknown> = JSON.parse(credential.claims_json);
    const allSalts: Record<string, string> = JSON.parse(credential.salts_json);

    // Build reveals only for disclosed fields
    const reveals: Array<{ name: string; value: unknown; salt: string }> = [];
    for (const claimName of data.disclosedClaims) {
      if (allClaims[claimName] !== undefined && allSalts[claimName] !== undefined) {
        reveals.push({ name: claimName, value: allClaims[claimName], salt: allSalts[claimName] });
      }
    }

    const shareToken = crypto.randomBytes(32).toString('base64url');
    // If expiresInHours is 0 -> never expires (10 years)
    const durationHours = data.expiresInHours === 0 ? 10 * 365 * 24 : data.expiresInHours;
    const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
    let passcodeHash: string | null = null;
    if (data.passcode) {
      passcodeHash = crypto.createHash('sha256').update(data.passcode).digest('hex');
    }

    db.prepare(`
      INSERT INTO shares (share_token, credential_id, disclosed_claims_json, reveals_json, expires_at, passcode_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      shareToken,
      credential.id,
      JSON.stringify(data.disclosedClaims),
      JSON.stringify(reveals),
      expiresAt,
      passcodeHash
    );

    res.status(201).json({
      shareToken,
      shareUrl: `http://localhost:5173/verify/share/${shareToken}`,
      expiresAt,
      disclosedClaims: data.disclosedClaims,
    });
  } catch (err) { next(err); }
});

studentRouter.get('/shares', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(req.user!.userId) as any;
    if (!student) throw new AppError('NOT_FOUND', 'Student not found', 404);

    const shares = db.prepare(`
      SELECT sh.*, c.credential_id, c.status as credential_status
      FROM shares sh
      JOIN credentials c ON c.id = sh.credential_id
      WHERE c.student_id = ?
      ORDER BY sh.id DESC
    `).all(student.id);

    res.json({ shares });
  } catch (err) { next(err); }
});

studentRouter.delete('/shares/:token', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(req.user!.userId) as any;
    if (!student) throw new AppError('NOT_FOUND', 'Student not found', 404);

    const share = db.prepare(`
      SELECT sh.id FROM shares sh
      JOIN credentials c ON c.id = sh.credential_id
      WHERE sh.share_token = ? AND c.student_id = ?
    `).get(req.params.token, student.id) as any;
    if (!share) throw new AppError('NOT_FOUND', 'Share not found', 404);

    db.prepare(`UPDATE shares SET revoked_at = datetime('now') WHERE id = ?`).run(share.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Dev: Get outbox emails
studentRouter.get('/outbox', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM outbox_emails ORDER BY id DESC LIMIT 50').all();
    res.json({ emails: rows });
  } catch (err) { next(err); }
});
