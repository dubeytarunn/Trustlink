import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('DigiLocker & National Academic Depository (NAD) Integration', () => {
  const app = createApp();
  const demoCredentialId = 'TL-G807-HDAB-BZ7R-8';

  it('GET /api/digilocker/issuers lists accredited Indian institutions', async () => {
    const res = await request(app).get('/api/digilocker/issuers');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.issuers)).toBe(true);
    expect(res.body.issuers.length).toBeGreaterThanOrEqual(4);

    const iit = res.body.issuers.find((i: any) => i.orgId === 'in.ac.iitd');
    expect(iit).toBeDefined();
    expect(iit.category).toBe('INSTITUTE');
  });

  it('POST /api/digilocker/pull-doc fails with missing parameters', async () => {
    const res = await request(app)
      .post('/api/digilocker/pull-doc')
      .send({ orgId: 'in.ac.iitd' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('POST /api/digilocker/pull-doc rejects unaccredited institution', async () => {
    const res = await request(app)
      .post('/api/digilocker/pull-doc')
      .send({
        orgId: 'in.unknown.fake-uni',
        docType: 'DEGREE',
        rollNumber: '24BAI1523',
        passingYear: 2026,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('not accredited');
  });

  it('POST /api/digilocker/pull-doc pulls official degree and verifies MeitY digital signature', async () => {
    const res = await request(app)
      .post('/api/digilocker/pull-doc')
      .send({
        orgId: 'in.ac.vit',
        docType: 'DEGREE',
        rollNumber: '24BAI1523',
        passingYear: 2026,
        candidateName: 'Tarun Dubey',
        credentialId: demoCredentialId,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const doc = res.body.document;
    expect(doc).toBeDefined();
    expect(doc.uri).toContain('in.gov.digilocker.nad/DEGREE/2026/24BAI1523');
    expect(doc.nadDigitalSignature.verified).toBe(true);
    expect(doc.candidate.name).toBe('Tarun Dubey');
    expect(doc.crossVerification).toBeDefined();
    expect(doc.crossVerification.status).toBe('MATCH');
    expect(doc.crossVerification.congruenceScore).toBeGreaterThanOrEqual(85);
    expect(doc.verificationStatus).toBe('VERIFIED_NAD');
  });

  it('GET /api/digilocker/doc/:uri inspects previously pulled document', async () => {
    const uri = encodeURIComponent('in.gov.digilocker.nad/DEGREE/2026/24BAI1523');
    const res = await request(app).get(`/api/digilocker/doc/${uri}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.document.rollNumber).toBe('24BAI1523');
    expect(res.body.document.verificationStatus).toBe('VERIFIED_NAD');
  });

  it('GET /api/verify/credential/:credentialId includes linked DigiLocker NAD verified record', async () => {
    const res = await request(app).get(`/api/verify/credential/${demoCredentialId}`);

    expect(res.status).toBe(200);
    expect(res.body.isValid).toBe(true);
    expect(res.body.digilockerDoc).toBeDefined();
    expect(res.body.digilockerDoc.verification_status).toBe('VERIFIED_NAD');
    expect(res.body.digilockerDoc.roll_number).toBe('24BAI1523');
  });
});
