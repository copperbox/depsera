import { Router } from 'express';
import { getLatencyStats } from './getLatencyStats';

const router = Router();

// GET /api/latency/:dependencyId - Get latency stats for a dependency
router.get('/:dependencyId', getLatencyStats);

export default router;
