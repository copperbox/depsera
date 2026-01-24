import { Router, Request, Response } from 'express';
import db from '../db';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  try {
    // Test database connection
    const result = db.prepare('SELECT 1 as ok').get() as { ok: number };

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: result.ok === 1 ? 'connected' : 'error'
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
