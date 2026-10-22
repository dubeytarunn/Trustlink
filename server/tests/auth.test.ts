import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { createInMemoryDatabase } from '../src/db/connection';
import { hashPassword } from '../src/crypto/password';

describe('Auth API & Role-Based Access Control Matrix', () => {
  const app = createApp();

  it('should authenticate user and return accessToken with httpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@trustlink.demo', password: 'DemoAdmin123!' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: 'admin@trustlink.demo',
      role: 'admin',
    });
    expect(res.body.accessToken).toBeDefined();

    // Verify cookies set
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.includes('trustlink_access_token='))).toBe(true);
    expect(cookies.some((c: string) => c.includes('trustlink_refresh_token='))).toBe(true);
  });

  it('should reject invalid password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@trustlink.demo', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should block non-admin users from accessing admin routes with 403', async () => {
    // Login as student
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@northbridge.demo', password: 'DemoStudent123!' });

    const studentToken = loginRes.body.accessToken;

    // Attempt to access admin universities endpoint
    const adminRes = await request(app)
      .get('/api/admin/universities')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(adminRes.status).toBe(403);
    expect(adminRes.body.error.code).toBe('FORBIDDEN');
  });

  it('should allow admin user to access admin routes with 200', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@trustlink.demo', password: 'DemoAdmin123!' });

    const adminToken = loginRes.body.accessToken;

    const res = await request(app)
      .get('/api/admin/universities')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.universities).toBeInstanceOf(Array);
  });
});
