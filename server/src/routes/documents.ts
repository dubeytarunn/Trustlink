import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { getDatabase } from '../db/connection';
import { processDocument } from '../services/verification-engine';

export const documentsRouter = Router();

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

documentsRouter.post('/analyze', upload.single('document'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No document provided' });
      return;
    }

    const { credentialId, documentType, biometricScore, biometricVerdict, candidatePhotoUrl } = req.body;
    
    if (!credentialId) {
      res.status(400).json({ error: 'credentialId is required' });
      return;
    }

    const db = getDatabase();
    const cred = db.prepare(`
      SELECT c.*, uk.public_key_pem
      FROM credentials c
      JOIN university_keys uk ON uk.kid = c.kid
      WHERE c.credential_id = ?
    `).get(credentialId) as any;

    if (!cred) {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }

    const claims = JSON.parse(cred.claims_json);
    
    const biometric = biometricScore !== undefined ? {
      score: Number(biometricScore),
      verdict: String(biometricVerdict || (Number(biometricScore) >= 75 ? 'MATCH' : 'MISMATCH'))
    } : undefined;

    const result = await processDocument(
      req.file.buffer, 
      req.file.mimetype, 
      documentType || 'Degree Certificate', 
      claims,
      biometric
    );

    // If biometric audit is provided, persist it in biometric_verifications table
    if (biometric) {
      try {
        const cryptoModule = await import('crypto');
        const refHash = cryptoModule.default.createHash('sha256').update(credentialId).digest('hex');
        const candHash = cryptoModule.default.createHash('sha256').update(candidatePhotoUrl || 'uploaded-photo').digest('hex');
        db.prepare(`
          INSERT INTO biometric_verifications (credential_id, similarity_score, verdict, reference_photo_hash, candidate_photo_hash, notes)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          credentialId,
          biometric.score,
          biometric.verdict,
          refHash,
          candHash,
          `Automated biometric facial verification during document intelligence analysis for ${credentialId}`
        );
      } catch (bioErr) {
        console.warn('Failed to insert biometric verification audit:', bioErr);
      }
    }

    // Save verification result to DB
    const insert = db.prepare(`
      INSERT INTO document_verifications 
      (credential_id, document_type, extracted_fields_json, checks_json, risk_score, risk_level, result)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      credentialId,
      result.documentType,
      JSON.stringify(result.extractedFields),
      JSON.stringify({ ...result.matches, ...result.checks }),
      result.riskScore,
      result.riskLevel,
      result.result
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});
