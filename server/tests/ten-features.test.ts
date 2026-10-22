import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('TrustLink 10 Features Acceptance & Regression Test Suite', () => {
  const app = createApp();

  // Test 1: Regression Test - Preserved Demo Credential TL-G807-HDAB-BZ7R-8
  it('should verify preserved demo credential TL-G807-HDAB-BZ7R-8 as VALID', async () => {
    const res = await request(app).get('/api/verify/credential/TL-G807-HDAB-BZ7R-8');
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('valid');
    expect(res.body.isValid).toBe(true);
    expect(res.body.signatureValid).toBe(true);
    expect(res.body.checks).toBeDefined();
    expect(res.body.checks.credentialIntegrity).toBe(true);
    expect(res.body.checks.universitySignature).toBe(true);
    expect(res.body.checks.issuerAuthorization).toBe(true);
    expect(res.body.checks.credentialStatus).toBe(true);
    expect(res.body.w3cCredential).toBeDefined();
    expect(res.body.w3cCredential.type).toContain('VerifiableCredential');
  });

  // Test 2: Regression Test - Preserved Demo Share Token demo-share-verified-token
  it('should verify preserved demo share token demo-share-verified-token with selective disclosure', async () => {
    const res = await request(app).post('/api/verify/share/demo-share-verified-token').send({});
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('valid');
    expect(res.body.isValid).toBe(true);
    expect(res.body.commitmentsMatch).toBe(true);
    expect(res.body.disclosedClaims).toBeDefined();
    expect(res.body.disclosedClaims.length).toBeGreaterThan(0);
    // GPA must be hidden in undisclosed claims
    expect(res.body.undisclosedClaims).toContain('gpa');
    // Value of GPA must NOT be in disclosedClaims
    const gpaDisclosed = res.body.disclosedClaims.find((c: any) => c.name === 'gpa');
    expect(gpaDisclosed).toBeUndefined();
  });

  // Test 3: Feature 8 - Expired Share Presentation Detection
  it('should report outcome "expired" for demo-share-expired-token without invalidating the credential', async () => {
    const res = await request(app).post('/api/verify/share/demo-share-expired-token').send({});
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('expired');
    expect(res.body.isValid).toBe(false);
    expect(res.body.failureReason).toContain('presentation is no longer valid');

    // The underlying credential must still be valid
    const credRes = await request(app).get('/api/verify/credential/TL-G807-HDAB-BZ7R-8');
    expect(credRes.body.outcome).toBe('valid');
  });

  // Test 4: Feature 2 - Credential Revocation Detection
  it('should verify revoked credential TL-REVOKED-DEMO-0001-A as REVOKED', async () => {
    const res = await request(app).get('/api/verify/credential/TL-REVOKED-DEMO-0001-A');
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('revoked');
    expect(res.body.isValid).toBe(false);
    expect(res.body.signatureValid).toBe(true); // Original ECDSA signature was valid, but status is revoked!
    expect(res.body.failureReason).toContain('revoked');
  });

  // Test 5: Feature 2 - Credential Suspension Detection
  it('should verify suspended credential TL-SUSPEND-DEMO-0002-B as SUSPENDED', async () => {
    const res = await request(app).get('/api/verify/credential/TL-SUSPEND-DEMO-0002-B');
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('suspended');
    expect(res.body.isValid).toBe(false);
    expect(res.body.failureReason).toContain('suspended');
  });

  // Test 6: Feature 4 - W3C Verifiable Credential Endpoint
  it('should return valid W3C Verifiable Credential data model', async () => {
    const res = await request(app).get('/api/credentials/TL-G807-HDAB-BZ7R-8/w3c');
    expect(res.status).toBe(200);
    expect(res.body['@context']).toContain('https://www.w3.org/2018/credentials/v1');
    expect(res.body.id).toBe('urn:trustlink:credential:TL-G807-HDAB-BZ7R-8');
    expect(res.body.type).toContain('VerifiableCredential');
    expect(res.body.issuer).toBeDefined();
    expect(res.body.issuer.name).toBe('Northbridge Institute of Technology');
    expect(res.body.credentialSubject).toBeDefined();
    expect(res.body.credentialStatus.status).toBe('VALID');
    expect(res.body.proof.type).toBe('JsonWebSignature2020');
  });

  // Test 7: Feature 6 - University Trust Registry
  it('should return verified institutions in Trust Registry', async () => {
    const res = await request(app).get('/api/trust-registry');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.trustRegistry)).toBe(true);
    const northbridge = res.body.trustRegistry.find((u: any) => u.name === 'Northbridge Institute of Technology');
    expect(northbridge).toBeDefined();
    expect(northbridge.authorized).toBe(true);
    expect(northbridge.status).toBe('ACTIVE');
  });

  // Test 8: Feature 3 - QR Code Generation
  it('should generate QR code data URL for verification link', async () => {
    const res = await request(app).get('/api/verify/qr?text=http://localhost:5173/verify/credential/TL-G807-HDAB-BZ7R-8');
    expect(res.status).toBe(200);
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(res.body.text).toContain('TL-G807-HDAB-BZ7R-8');
  });

  // Test 9: Feature 7 - Employer Credential Request Flow
  it('should support employer credential request creation and retrieval', async () => {
    // 1. Authenticate employer
    const empLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'hr@acme-corp.demo', password: 'DemoEmployer123!' });
    const empToken = empLogin.body.accessToken;

    // 2. Create request
    const createReq = await request(app)
      .post('/api/credential-requests')
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        studentEmail: 'student@northbridge.demo',
        requestedClaims: ['degree', 'graduationYear'],
        purpose: 'Automated Background Verification Test',
      });
    expect(createReq.status).toBe(201);
    expect(createReq.body.requestId).toMatch(/^REQ-/);
    const reqId = createReq.body.requestId;

    // 3. Student views request
    const stuLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@northbridge.demo', password: 'DemoStudent123!' });
    const stuToken = stuLogin.body.accessToken;

    const listReq = await request(app)
      .get('/api/credential-requests')
      .set('Authorization', `Bearer ${stuToken}`);
    expect(listReq.status).toBe(200);
    const found = listReq.body.requests.find((r: any) => r.request_id === reqId);
    expect(found).toBeDefined();
    expect(found.status).toBe('PENDING');

    // 4. Student approves request
    const approveRes = await request(app)
      .post(`/api/credential-requests/${reqId}/respond`)
      .set('Authorization', `Bearer ${stuToken}`)
      .send({ action: 'APPROVE', credentialId: 'TL-G807-HDAB-BZ7R-8' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('APPROVED');
    expect(approveRes.body.shareToken).toBeDefined();

    // 5. Verify the generated share token
    const verifyShare = await request(app)
      .post(`/api/verify/share/${approveRes.body.shareToken}`)
      .send({});
    expect(verifyShare.status).toBe(200);
    expect(verifyShare.body.outcome).toBe('valid');
    expect(verifyShare.body.disclosedClaims.map((c: any) => c.name)).toContain('degree');
    expect(verifyShare.body.disclosedClaims.map((c: any) => c.name)).not.toContain('gpa');
  });

  // Test 10: Feature 2 & 10 - University Suspend, Restore, and History APIs
  it('should allow university to suspend and restore credentials with history audit', async () => {
    // 1. Authenticate university
    const uniLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'uni@northbridge.demo', password: 'DemoUni123!' });
    const uniToken = uniLogin.body.accessToken;

    // 2. Suspend TL-SKILL-8080-ZK7R-9
    const suspRes = await request(app)
      .post('/api/university/credentials/TL-SKILL-8080-ZK7R-9/suspend')
      .set('Authorization', `Bearer ${uniToken}`)
      .send({ reason: 'Audit hold for practical exam score validation' });
    expect(suspRes.status).toBe(200);
    expect(suspRes.body.status).toBe('suspended');

    // Verification check should now be suspended
    const checkSusp = await request(app).get('/api/verify/credential/TL-SKILL-8080-ZK7R-9');
    expect(checkSusp.body.outcome).toBe('suspended');

    // 3. Restore TL-SKILL-8080-ZK7R-9
    const restRes = await request(app)
      .post('/api/university/credentials/TL-SKILL-8080-ZK7R-9/restore')
      .set('Authorization', `Bearer ${uniToken}`)
      .send({ reason: 'Audit hold resolved successfully' });
    expect(restRes.status).toBe(200);
    expect(restRes.body.status).toBe('active');

    // Verification check should now be valid again
    const checkRest = await request(app).get('/api/verify/credential/TL-SKILL-8080-ZK7R-9');
    expect(checkRest.body.outcome).toBe('valid');

    // 4. Verify history log
    const histRes = await request(app).get('/api/credentials/TL-SKILL-8080-ZK7R-9/history');
    expect(histRes.status).toBe(200);
    expect(histRes.body.history.length).toBeGreaterThanOrEqual(2);
  });
});
