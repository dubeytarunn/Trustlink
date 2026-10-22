import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db/connection';
import { authenticate, requireRole } from '../middleware/auth';
import { generateUniversityKeyPair } from '../crypto/keys';
import { env } from '../config/env';
import { LogRepository } from '../db/repositories/log-repository';
import { hashPassword } from '../crypto/password';
import { AppError } from '../middleware/error-handler';
import { verifyCredential } from '../crypto/sign-verify';

export const adminRouter = Router();

// Protect all admin endpoints with admin role
adminRouter.use(authenticate);
adminRouter.use(requireRole('admin'));

const onboardUniversitySchema = z.object({
  name: z.string().min(2),
  domain: z.string().min(3),
  country: z.string().min(2),
  registrarEmail: z.string().email(),
  logoUrl: z.string().optional(),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

/**
 * FR-01: Onboard a new university and generate its initial cryptographic keypair.
 * University private keys are encrypted at rest with AES-256-GCM and NEVER exposed.
 */
adminRouter.post('/universities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = onboardUniversitySchema.parse(req.body);
    const db = getDatabase();
    const logRepo = new LogRepository(db);

    const existingDomain = db.prepare('SELECT id FROM universities WHERE domain = ?').get(data.domain);
    if (existingDomain) {
      throw new AppError('DOMAIN_EXISTS', `A university with domain ${data.domain} is already registered`, 400);
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(data.adminEmail.toLowerCase().trim());
    if (existingUser) {
      throw new AppError('EMAIL_EXISTS', `A user with email ${data.adminEmail} already exists`, 400);
    }

    const adminPasswordHash = await hashPassword(data.adminPassword);

    const tx = db.transaction(() => {
      // 1. Insert university
      const uniStmt = db.prepare(`
        INSERT INTO universities (name, domain, country, registrar_email, logo_url, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `);
      const uniInfo = uniStmt.run(data.name, data.domain, data.country, data.registrarEmail, data.logoUrl || null);
      const universityId = Number(uniInfo.lastInsertRowid);

      // 2. Generate ECDSA P-256 Keypair (Version 1)
      const keyResult = generateUniversityKeyPair(universityId, 1, env.KEY_ENCRYPTION_SECRET);

      // 3. Store keys with private key encrypted
      const keyStmt = db.prepare(`
        INSERT INTO university_keys (university_id, kid, public_key_pem, public_jwk, private_key_enc, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `);
      keyStmt.run(
        universityId,
        keyResult.kid,
        keyResult.publicKeyPem,
        JSON.stringify(keyResult.publicJwk),
        keyResult.privateKeyEnc
      );

      // 4. Create university admin user
      const userStmt = db.prepare(`
        INSERT INTO users (email, password_hash, role, university_id, status)
        VALUES (?, ?, 'university', ?, 'active')
      `);
      const userInfo = userStmt.run(data.adminEmail.toLowerCase().trim(), adminPasswordHash, universityId);

      // 5. Append to hash-chained audit log
      logRepo.appendAuditLog({
        actor_user_id: req.user!.userId,
        action: 'UNIVERSITY_ONBOARDED',
        entity_type: 'university',
        entity_id: String(universityId),
        details: {
          name: data.name,
          domain: data.domain,
          kid: keyResult.kid,
          fingerprint: keyResult.fingerprint,
        },
      });

      return {
        university: {
          id: universityId,
          name: data.name,
          domain: data.domain,
          country: data.country,
          registrarEmail: data.registrarEmail,
          logoUrl: data.logoUrl,
          status: 'active',
        },
        key: {
          kid: keyResult.kid,
          fingerprint: keyResult.fingerprint,
          publicKeyPem: keyResult.publicKeyPem,
          publicJwk: keyResult.publicJwk,
          // CRITICAL: privateKeyEnc and privateKey are STRICTLY omitted!
        },
        adminUser: {
          id: Number(userInfo.lastInsertRowid),
          email: data.adminEmail,
          role: 'university',
        },
      };
    });

    const result = tx();
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * List all onboarded universities with their active key ID and issuance statistics.
 */
adminRouter.get('/universities', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT 
        u.*,
        k.kid as active_kid,
        k.public_jwk,
        (SELECT COUNT(*) FROM credentials c WHERE c.university_id = u.id) as credentials_issued_count,
        (SELECT COUNT(*) FROM students s WHERE s.university_id = u.id) as students_count
      FROM universities u
      LEFT JOIN university_keys k ON k.university_id = u.id AND k.status = 'active'
      ORDER BY u.id DESC
    `).all();

    const formatted = rows.map((row: any) => ({
      ...row,
      public_jwk: row.public_jwk ? JSON.parse(row.public_jwk) : null,
    }));

    res.json({ universities: formatted });
  } catch (err) {
    next(err);
  }
});

/**
 * Key Rotation: Rotates a university's cryptographic signing key.
 * Creates a new active key version (k2), marks old key retired.
 */
adminRouter.post('/universities/:id/rotate-key', (req: Request, res: Response, next: NextFunction) => {
  try {
    const universityId = Number(req.params.id);
    const db = getDatabase();
    const logRepo = new LogRepository(db);

    const uni = db.prepare('SELECT id, name FROM universities WHERE id = ?').get(universityId) as { id: number; name: string } | undefined;
    if (!uni) throw new AppError('NOT_FOUND', 'University not found', 404);

    const tx = db.transaction(() => {
      // Find current active key count to calculate next version number
      const keyCountRow = db.prepare('SELECT COUNT(*) as count FROM university_keys WHERE university_id = ?').get(universityId) as { count: number };
      const nextVersion = keyCountRow.count + 1;

      // Mark current active key as retired
      db.prepare(`
        UPDATE university_keys
        SET status = 'retired', retired_at = datetime('now')
        WHERE university_id = ? AND status = 'active'
      `).run(universityId);

      // Generate next key version
      const keyResult = generateUniversityKeyPair(universityId, nextVersion, env.KEY_ENCRYPTION_SECRET);

      db.prepare(`
        INSERT INTO university_keys (university_id, kid, public_key_pem, public_jwk, private_key_enc, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `).run(
        universityId,
        keyResult.kid,
        keyResult.publicKeyPem,
        JSON.stringify(keyResult.publicJwk),
        keyResult.privateKeyEnc
      );

      // Log to audit log
      logRepo.appendAuditLog({
        actor_user_id: req.user!.userId,
        action: 'KEY_ROTATED',
        entity_type: 'university',
        entity_id: String(universityId),
        details: {
          universityName: uni.name,
          newKid: keyResult.kid,
          fingerprint: keyResult.fingerprint,
        },
      });

      return {
        success: true,
        message: `Cryptographic key successfully rotated to version ${nextVersion}`,
        key: {
          kid: keyResult.kid,
          fingerprint: keyResult.fingerprint,
          publicKeyPem: keyResult.publicKeyPem,
          publicJwk: keyResult.publicJwk,
        },
      };
    });

    const result = tx();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Suspend university: Prevents issuance and causes verification of issued credentials to return 'issuer_suspended'.
 */
adminRouter.post('/universities/:id/suspend', (req: Request, res: Response, next: NextFunction) => {
  try {
    const universityId = Number(req.params.id);
    const db = getDatabase();
    const logRepo = new LogRepository(db);

    db.prepare("UPDATE universities SET status = 'suspended' WHERE id = ?").run(universityId);

    logRepo.appendAuditLog({
      actor_user_id: req.user!.userId,
      action: 'UNIVERSITY_SUSPENDED',
      entity_type: 'university',
      entity_id: String(universityId),
      details: { reason: req.body?.reason || 'Administrative suspension' },
    });

    res.json({ success: true, message: 'University suspended successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * Reactivate university.
 */
adminRouter.post('/universities/:id/reactivate', (req: Request, res: Response, next: NextFunction) => {
  try {
    const universityId = Number(req.params.id);
    const db = getDatabase();
    const logRepo = new LogRepository(db);

    db.prepare("UPDATE universities SET status = 'active' WHERE id = ?").run(universityId);

    logRepo.appendAuditLog({
      actor_user_id: req.user!.userId,
      action: 'UNIVERSITY_REACTIVATED',
      entity_type: 'university',
      entity_id: String(universityId),
      details: {},
    });

    res.json({ success: true, message: 'University reactivated successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * Queryable audit log endpoint.
 */
adminRouter.get('/audit-log', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const rows = db.prepare(`
      SELECT a.*, u.email as actor_email
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.actor_user_id
      ORDER BY a.seq DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const totalRow = db.prepare('SELECT COUNT(*) as total FROM audit_log').get() as { total: number };

    res.json({
      entries: rows.map((r: any) => ({
        ...r,
        details: JSON.parse(r.details_json || '{}'),
      })),
      pagination: {
        page,
        limit,
        total: totalRow.total,
        totalPages: Math.ceil(totalRow.total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Cryptographic verification of the entire audit log hash chain.
 */
adminRouter.get('/audit-log/integrity', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const logRepo = new LogRepository(db);
    const result = logRepo.verifyAuditLogChain();

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Tamper Lab: Get credentials available for simulation
 */
adminRouter.get('/tamper/credentials', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const creds = db.prepare(`
      SELECT c.*, u.name as university_name, u.status as university_status, uk.public_key_pem,
        s.full_name as student_name, s.student_number
      FROM credentials c
      JOIN universities u ON u.id = c.university_id
      JOIN university_keys uk ON uk.kid = c.kid
      JOIN students s ON s.id = c.student_id
      ORDER BY c.id DESC
      LIMIT 10
    `).all() as any[];

    res.json({
      credentials: creds.map((c) => ({
        id: c.id,
        credentialId: c.credential_id,
        universityName: c.university_name,
        universityStatus: c.university_status,
        studentName: c.student_name,
        studentNumber: c.student_number,
        payload: JSON.parse(c.payload_json),
        claims: JSON.parse(c.claims_json),
        salts: JSON.parse(c.salts_json),
        signature: c.signature,
        publicKeyPem: c.public_key_pem,
        status: c.status,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const simulateTamperSchema = z.object({
  payload: z.any(),
  signature: z.string(),
  publicKeyPem: z.string(),
  reveals: z.array(z.object({
    name: z.string(),
    value: z.any(),
    salt: z.string(),
  })),
  credentialStatus: z.enum(['active', 'revoked']).default('active'),
  issuerStatus: z.enum(['active', 'suspended']).default('active'),
});

adminRouter.post('/tamper/simulate', (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = simulateTamperSchema.parse(req.body);
    const result = verifyCredential({
      payload: data.payload,
      signature: data.signature,
      publicKeyPem: data.publicKeyPem,
      reveals: data.reveals as any,
      credentialStatus: data.credentialStatus,
      issuerStatus: data.issuerStatus,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});
