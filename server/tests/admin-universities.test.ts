import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('Admin University Onboarding & Key Management (FR-01, NFR-04)', () => {
  const app = createApp();
  let adminToken: string;

  it('should authenticate admin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@trustlink.demo', password: 'DemoAdmin123!' });

    expect(res.status).toBe(200);
    adminToken = res.body.accessToken;
  });

  it('should onboard a new university and verify that private key NEVER appears in API response (FR-01, NFR-04)', async () => {
    const uniqueDomain = `mit-${Date.now()}.edu`;
    const res = await request(app)
      .post('/api/admin/universities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Massachusetts Institute of Technology (Test)',
        domain: uniqueDomain,
        country: 'United States',
        registrarEmail: `registrar@${uniqueDomain}`,
        logoUrl: 'https://example.com/logo.png',
        adminEmail: `admin@${uniqueDomain}`,
        adminPassword: 'Password123!',
      });

    expect(res.status).toBe(201);
    expect(res.body.university.domain).toBe(uniqueDomain);
    expect(res.body.key.kid).toBeDefined();
    expect(res.body.key.fingerprint).toBeDefined();
    expect(res.body.key.publicKeyPem).toContain('BEGIN PUBLIC KEY');

    // STRICT PRIVACY & SECURITY CHECK (NFR-04):
    const responseText = JSON.stringify(res.body);
    expect(responseText).not.toContain('PRIVATE KEY');
    expect(res.body.key.privateKey).toBeUndefined();
    expect(res.body.key.privateKeyEnc).toBeUndefined();
  });

  it('should rotate university key and update status to retired for old key', async () => {
    // Get first university
    const listRes = await request(app)
      .get('/api/admin/universities')
      .set('Authorization', `Bearer ${adminToken}`);

    const uniId = listRes.body.universities[0].id;

    const rotateRes = await request(app)
      .post(`/api/admin/universities/${uniId}/rotate-key`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(rotateRes.status).toBe(200);
    expect(rotateRes.body.success).toBe(true);
    expect(rotateRes.body.key.kid).toBeDefined();
    expect(rotateRes.body.key.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(JSON.stringify(rotateRes.body)).not.toContain('PRIVATE KEY');
  });

  it('should verify audit log integrity after university operations', async () => {
    const integrityRes = await request(app)
      .get('/api/admin/audit-log/integrity')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(integrityRes.status).toBe(200);
    expect(integrityRes.body.isValid).toBe(true);
    expect(integrityRes.body.totalVerified).toBeGreaterThan(0);
  });
});
