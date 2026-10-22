import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('ATS Batch Credential Verification (FR-20+)', () => {
  const app = createApp();
  let employerToken: string;
  const primaryValidCred = 'TL-G807-HDAB-BZ7R-8';

  it('authenticates employer user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'hr@acme-corp.demo', password: 'DemoEmployer123!' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('employer');
    employerToken = res.body.accessToken;
  });

  it('POST /api/employer/batch-verify requires authorization', async () => {
    const res = await request(app)
      .post('/api/employer/batch-verify')
      .send({ items: [{ credentialId: primaryValidCred }] });

    expect(res.status).toBe(401);
  });

  it('POST /api/employer/batch-verify rejects empty items list', async () => {
    const res = await request(app)
      .post('/api/employer/batch-verify')
      .set('Authorization', `Bearer ${employerToken}`)
      .send({ items: [] });

    expect(res.status).toBe(400);
  });

  it('POST /api/employer/batch-verify executes parallel bulk verification with metrics and audit hash', async () => {
    const batchPayload = {
      items: [
        {
          applicantId: 'APP-101',
          candidateName: 'Tarun Dubey',
          credentialId: primaryValidCred,
        },
        {
          applicantId: 'APP-102',
          candidateName: 'Imposter Candidate',
          credentialId: primaryValidCred, // Name mismatch test
        },
        {
          applicantId: 'APP-103',
          candidateName: 'John Doe',
          credentialId: 'TL-NON-EXISTENT-999', // Missing credential test
        },
      ],
    };

    const res = await request(app)
      .post('/api/employer/batch-verify')
      .set('Authorization', `Bearer ${employerToken}`)
      .send(batchPayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { summary, results } = res.body;
    expect(summary).toBeDefined();
    expect(summary.total).toBe(3);
    expect(summary.valid).toBe(1);
    expect(summary.flagged).toBe(1); // 1 name mismatch
    expect(summary.failed).toBe(1);  // 1 not found
    expect(summary.batchAuditHash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof summary.durationMs).toBe('number');

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(3);

    // Item 1: Valid
    const item1 = results.find((r: any) => r.applicantId === 'APP-101');
    expect(item1.isValid).toBe(true);
    expect(item1.signatureValid).toBe(true);
    expect(item1.riskLevel).toBe('LOW');

    // Item 2: Name Mismatch
    const item2 = results.find((r: any) => r.applicantId === 'APP-102');
    expect(item2.outcome).toBe('name_mismatch');
    expect(item2.riskLevel).toBe('HIGH');

    // Item 3: Not Found
    const item3 = results.find((r: any) => r.applicantId === 'APP-103');
    expect(item3.outcome).toBe('not_found');
    expect(item3.isValid).toBe(false);
  });
});
