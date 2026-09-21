import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/connection';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const result = db.prepare('SELECT 1 as healthy').get() as { healthy: number };

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: result?.healthy === 1 ? 'connected' : 'unhealthy',
      version: '1.0.0',
      service: 'TrustLink Verification Platform API',
    });
  } catch (err: unknown) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: err instanceof Error ? err.message : 'Database error',
    });
  }
});
