import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('API Health Endpoint', () => {
  const app = createApp();

  it('GET /api/health should return 200 with status ok and connected database', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      database: 'connected',
      version: '1.0.0',
      service: 'TrustLink Verification Platform API',
    });
    expect(res.body.timestamp).toBeDefined();
  });
});
