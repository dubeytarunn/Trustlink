import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('Employer Verification & API Key Management (FR-11, FR-12, FR-20)', () => {
  const app = createApp();
  let employerToken: string;
  let createdKeyId: number;

  it('should authenticate employer user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'hr@acme-corp.demo', password: 'DemoEmployer123!' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('employer');
    employerToken = res.body.accessToken;
  });

  it('should fetch employer profile and verification metrics', async () => {
    const res = await request(app)
      .get('/api/employer/profile')
      .set('Authorization', `Bearer ${employerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.employer.companyName).toBe('Acme Global Corporation');
    expect(res.body.employer.status).toBe('verified');
    expect(res.body.stats).toBeDefined();
  });

  it('should generate machine verification API key (FR-20)', async () => {
    const res = await request(app)
      .post('/api/employer/api-keys')
      .set('Authorization', `Bearer ${employerToken}`)
      .send();

    expect(res.status).toBe(201);
    expect(res.body.apiKey).toMatch(/^tl_live_[0-9a-f]{32}$/);
    expect(res.body.prefix).toMatch(/^tl_live_[0-9a-f]{8}$/);
    expect(res.body.id).toBeDefined();
    createdKeyId = res.body.id;
  });

  it('should list active API keys with masked prefixes', async () => {
    const res = await request(app)
      .get('/api/employer/api-keys')
      .set('Authorization', `Bearer ${employerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.keys)).toBe(true);
    const key = res.body.keys.find((k: any) => k.id === createdKeyId);
    expect(key).toBeDefined();
    expect(key.revoked_at).toBeNull();
    // Raw secret key must NOT be stored in DB response
    expect(key.key_hash).toBeUndefined();
    expect(key.apiKey).toBeUndefined();
  });

  it('should revoke an API key', async () => {
    const res = await request(app)
      .delete(`/api/employer/api-keys/${createdKeyId}`)
      .set('Authorization', `Bearer ${employerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const listRes = await request(app)
      .get('/api/employer/api-keys')
      .set('Authorization', `Bearer ${employerToken}`);

    const key = listRes.body.keys.find((k: any) => k.id === createdKeyId);
    expect(key.revoked_at).not.toBeNull();
  });

  it('should verify credential and log hash-chained entry', async () => {
    const verifyRes = await request(app)
      .post('/api/employer/verify')
      .set('Authorization', `Bearer ${employerToken}`)
      .send({
        type: 'credential_id',
        query: 'TL-NONEXISTENT-0',
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.outcome).toBe('not_found');
    expect(verifyRes.body.isValid).toBe(false);

    // Verify verification log was appended
    const historyRes = await request(app)
      .get('/api/employer/verifications')
      .set('Authorization', `Bearer ${employerToken}`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.verifications.length).toBeGreaterThan(0);
    expect(historyRes.body.verifications[0].outcome).toBe('not_found');
  });
});
