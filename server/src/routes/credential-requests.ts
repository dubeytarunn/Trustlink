import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getDatabase } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/error-handler';
import { LogRepository } from '../db/repositories/log-repository';

export const credentialRequestsRouter = Router();

credentialRequestsRouter.use(authenticate);

// ─────────────────────────────────────────────
// POST /credential-requests: Employer creates request (Feature 7 & 10)
// ─────────────────────────────────────────────
const createRequestSchema = z.object({
  studentEmail: z.string().email(),
  credentialId: z.string().optional(),
  requestedClaims: z.array(z.string()).min(1),
  purpose: z.string().optional(),
});

credentialRequestsRouter.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const data = createRequestSchema.parse(req.body);

    const employer = db.prepare('SELECT id, company_name FROM employers WHERE user_id = ?').get(req.user!.userId) as any;
    if (!employer) throw new AppError('FORBIDDEN', 'Only verified employers can initiate credential requests', 403);

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
      actor_user_id: req.user!.userId,
      action: 'CREDENTIAL_REQUEST_CREATED',
      entity_type: 'credential_request',
      entity_id: requestId,
      details: {
        studentEmail: data.studentEmail,
        requestedClaims: data.requestedClaims,
        employerId: employer.id,
      },
    });

    res.status(201).json({
      requestId,
      employerName: employer.company_name,
      studentEmail: data.studentEmail,
      requestedClaims: data.requestedClaims,
      status: 'PENDING',
      message: 'Credential request generated and dispatched to student wallet',
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// GET /credential-requests: List requests for current user (Employer or Student)
// ─────────────────────────────────────────────
credentialRequestsRouter.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const user = req.user!;

    let requests: any[] = [];

    if (user.role === 'employer') {
      const employer = db.prepare('SELECT id FROM employers WHERE user_id = ?').get(user.userId) as any;
      if (employer) {
        requests = db.prepare(`
          SELECT cr.*, e.company_name, sh.share_token, sh.expires_at as share_expires_at
          FROM credential_requests cr
          JOIN employers e ON e.id = cr.employer_id
          LEFT JOIN shares sh ON sh.share_token = cr.share_token
          WHERE cr.employer_id = ?
          ORDER BY cr.id DESC
        `).all(employer.id);
      }
    } else if (user.role === 'student') {
      requests = db.prepare(`
        SELECT cr.*, e.company_name, e.official_email as employer_email, sh.share_token
        FROM credential_requests cr
        JOIN employers e ON e.id = cr.employer_id
        LEFT JOIN shares sh ON sh.share_token = cr.share_token
        WHERE cr.student_email = ?
        ORDER BY cr.id DESC
      `).all(user.email.toLowerCase());
    } else {
      requests = db.prepare(`
        SELECT cr.*, e.company_name
        FROM credential_requests cr
        JOIN employers e ON e.id = cr.employer_id
        ORDER BY cr.id DESC
        LIMIT 50
      `).all();
    }

    res.json({
      requests: requests.map((r) => ({
        ...r,
        requestedClaims: JSON.parse(r.requested_claims_json),
      })),
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// GET /credential-requests/:requestId
// ─────────────────────────────────────────────
credentialRequestsRouter.get('/:requestId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const { requestId } = req.params;

    const request = db.prepare(`
      SELECT cr.*, e.company_name, e.official_email as employer_email
      FROM credential_requests cr
      JOIN employers e ON e.id = cr.employer_id
      WHERE cr.request_id = ?
    `).get(requestId) as any;

    if (!request) throw new AppError('NOT_FOUND', 'Credential request not found', 404);

    res.json({
      request: {
        ...request,
        requestedClaims: JSON.parse(request.requested_claims_json),
      },
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// POST /credential-requests/:requestId/respond: Student Approves or Rejects (Feature 7 & 10)
// ─────────────────────────────────────────────
const respondSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  credentialId: z.string().optional(),
});

credentialRequestsRouter.post('/:requestId/respond', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const { requestId } = req.params;
    const { action, credentialId } = respondSchema.parse(req.body);
    const user = req.user!;

    if (user.role !== 'student') {
      throw new AppError('FORBIDDEN', 'Only students can respond to credential requests', 403);
    }

    const request = db.prepare(`
      SELECT cr.*, e.company_name
      FROM credential_requests cr
      JOIN employers e ON e.id = cr.employer_id
      WHERE cr.request_id = ?
    `).get(requestId) as any;

    if (!request) throw new AppError('NOT_FOUND', 'Credential request not found', 404);
    if (request.status !== 'PENDING') {
      throw new AppError('ALREADY_RESPONDED', `Request has already been ${request.status.toLowerCase()}`, 400);
    }

    // Verify student ownership
    if (request.student_email.toLowerCase() !== user.email.toLowerCase()) {
      throw new AppError('FORBIDDEN', 'This request is not addressed to your email', 403);
    }

    if (action === 'REJECT') {
      db.prepare(`
        UPDATE credential_requests
        SET status = 'REJECTED', responded_at = datetime('now')
        WHERE request_id = ?
      `).run(requestId);

      res.json({ success: true, status: 'REJECTED', message: 'Request rejected' });
      return;
    }

    // APPROVE action -> Generate Verifiable Presentation with selective disclosure
    const requestedClaims: string[] = JSON.parse(request.requested_claims_json);

    // Locate student's valid credential
    const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(user.userId) as any;
    if (!student) throw new AppError('NOT_FOUND', 'Student profile not found', 404);

    let credQuery = 'SELECT * FROM credentials WHERE student_id = ? AND status = ?';
    let credParams: any[] = [student.id, 'active'];

    if (credentialId || request.credential_id) {
      credQuery += ' AND credential_id = ?';
      credParams.push(credentialId || request.credential_id);
    }
    credQuery += ' ORDER BY id DESC LIMIT 1';

    const credential = db.prepare(credQuery).get(...credParams) as any;
    if (!credential) {
      throw new AppError('NOT_FOUND', 'No valid matching credential found to fulfill this request', 404);
    }

    const allClaims: Record<string, unknown> = JSON.parse(credential.claims_json);
    const allSalts: Record<string, string> = JSON.parse(credential.salts_json);

    // Build reveals ONLY for requested / disclosed claims
    const reveals: Array<{ name: string; value: unknown; salt: string }> = [];
    const disclosedClaims: string[] = [];

    for (const claimName of requestedClaims) {
      if (allClaims[claimName] !== undefined && allSalts[claimName] !== undefined) {
        reveals.push({ name: claimName, value: allClaims[claimName], salt: allSalts[claimName] });
        disclosedClaims.push(claimName);
      }
    }

    // Generate Share Token for the Verifiable Presentation (7 days expiry)
    const shareToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.transaction(() => {
      db.prepare(`
        INSERT INTO shares (share_token, credential_id, disclosed_claims_json, reveals_json, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        shareToken,
        credential.id,
        JSON.stringify(disclosedClaims),
        JSON.stringify(reveals),
        expiresAt
      );

      db.prepare(`
        UPDATE credential_requests
        SET status = 'APPROVED', share_token = ?, responded_at = datetime('now')
        WHERE request_id = ?
      `).run(shareToken, requestId);
    })();

    res.json({
      success: true,
      status: 'APPROVED',
      shareToken,
      shareUrl: `http://localhost:5173/verify/share/${shareToken}`,
      disclosedClaims,
      message: 'Verifiable Presentation created with approved selective disclosure',
    });
  } catch (err) { next(err); }
});
