import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { processDocument } from '../src/services/verification-engine';
import { getDatabase } from '../src/db/connection';

describe('Document Intelligence & Explainable Verification Engine', () => {
  const app = createApp();
  const demoCredentialId = 'TL-G807-HDAB-BZ7R-8';

  it('processDocument computes low risk score when fields and claims align', async () => {
    // Simulated certificate buffer
    const mockBuffer = Buffer.from('NORTHBRIDGE INSTITUTE OF TECHNOLOGY DEGREE CERTIFICATE TARUN DUBEY BACHELOR OF SCIENCE GPA 3.92');
    const claims = {
      studentName: 'Tarun Dubey',
      degree: 'Bachelor of Science',
      gpa: '3.92 / 4.00'
    };

    const result = await processDocument(mockBuffer, 'image/png', 'Degree Certificate', claims);

    expect(result).toBeDefined();
    expect(result.documentType).toBe('Degree Certificate');
    expect(result.riskScore).toBeGreaterThanOrEqual(50);
    expect(result.riskLevel).toBeDefined();
    expect(result.result).toBeDefined();
    expect(result.checks.documentReadable).toBe(true);
    expect(result.reasons).toBeInstanceOf(Array);
  });

  it('processDocument detects mismatches and flags suspicious claims', async () => {
    const mockBuffer = Buffer.from('SOME UNKNOWN ACADEMY DIPLOMA JOHN DOE ARTS 2.1');
    const claims = {
      studentName: 'Tarun Dubey',
      degree: 'Bachelor of Science',
      gpa: '3.92 / 4.00'
    };

    const result = await processDocument(mockBuffer, 'image/png', 'Degree Certificate', claims);

    expect(result).toBeDefined();
    expect(result.matches.studentName).toBe(false);
    expect(result.reasons.some(r => r.includes('mismatch') || r.includes('differs'))).toBe(true);
  });

  it('processDocument incorporates biometric facial match bonus', async () => {
    const mockBuffer = Buffer.from('NORTHBRIDGE INSTITUTE TARUN DUBEY BACHELOR OF SCIENCE 3.92');
    const claims = {
      studentName: 'Tarun Dubey',
      degree: 'Bachelor of Science',
      gpa: '3.92 / 4.00'
    };

    const result = await processDocument(mockBuffer, 'image/png', 'Degree Certificate', claims, {
      score: 94.5,
      verdict: 'MATCH'
    });

    expect(result.biometric).toBeDefined();
    expect(result.biometric?.verified).toBe(true);
    expect(result.biometric?.similarityScore).toBe(94.5);
    expect(result.matches.faceMatch).toBe(true);
    expect(result.reasons.some(r => r.includes('Biometric facial match confirmed'))).toBe(true);
  });

  it('processDocument penalizes risk score on biometric mismatch', async () => {
    const mockBuffer = Buffer.from('NORTHBRIDGE INSTITUTE TARUN DUBEY BACHELOR OF SCIENCE 3.92');
    const claims = {
      studentName: 'Tarun Dubey',
      degree: 'Bachelor of Science',
      gpa: '3.92 / 4.00'
    };

    const result = await processDocument(mockBuffer, 'image/png', 'Degree Certificate', claims, {
      score: 32.0,
      verdict: 'MISMATCH'
    });

    expect(result.biometric?.verified).toBe(false);
    expect(result.matches.faceMatch).toBe(false);
    expect(result.result).toBe('SUSPICIOUS');
    expect(result.riskLevel).toBe('HIGH');
    expect(result.reasons.some(r => r.includes('Biometric facial mismatch detected'))).toBe(true);
  });

  it('POST /api/documents/analyze rejects request without file', async () => {
    const res = await request(app)
      .post('/api/documents/analyze')
      .field('credentialId', demoCredentialId);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No document provided');
  });

  it('POST /api/documents/analyze rejects request without credentialId', async () => {
    const res = await request(app)
      .post('/api/documents/analyze')
      .attach('document', Buffer.from('Degree certificate text'), 'certificate.txt');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('credentialId is required');
  });

  it('POST /api/documents/analyze returns 404 for unknown credential', async () => {
    const res = await request(app)
      .post('/api/documents/analyze')
      .field('credentialId', 'TL-NON-EXISTENT-ID')
      .attach('document', Buffer.from('Degree certificate content'), 'certificate.txt');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Credential not found');
  });

  it('POST /api/documents/analyze processes document and logs to document_verifications & biometric audits', async () => {
    const res = await request(app)
      .post('/api/documents/analyze')
      .field('credentialId', demoCredentialId)
      .field('documentType', 'Degree Certificate')
      .field('biometricScore', '91.8')
      .field('biometricVerdict', 'MATCH')
      .attach('document', Buffer.from('CERTIFICATE OF GRADUATION TARUN DUBEY BACHELOR OF SCIENCE 3.92 NORTHBRIDGE INSTITUTE'), 'cert.txt');

    expect(res.status).toBe(200);
    expect(res.body.documentType).toBe('Degree Certificate');
    expect(res.body.riskScore).toBeGreaterThan(0);
    expect(res.body.biometric).toBeDefined();
    expect(res.body.biometric?.verified).toBe(true);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(res.body.riskLevel);
    expect(['VERIFIED', 'REVIEW', 'SUSPICIOUS']).toContain(res.body.result);

    // Verify biometric audit in database
    const db = getDatabase();
    const bioRow = db.prepare('SELECT * FROM biometric_verifications WHERE credential_id = ? ORDER BY id DESC LIMIT 1').get(demoCredentialId) as any;
    expect(bioRow).toBeDefined();
    expect(bioRow.similarity_score).toBe(91.8);
    expect(bioRow.verdict).toBe('MATCH');
  });
});
