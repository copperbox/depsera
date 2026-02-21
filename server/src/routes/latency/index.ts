import { Router } from 'express';
import { getLatencyStats } from './getLatencyStats';
import { getLatencyBuckets } from './getLatencyBuckets';

const router = Router();

// GET /api/latency/:dependencyId/buckets - Get time-bucketed latency data for charts
router.get('/:dependencyId/buckets', getLatencyBuckets);

// GET /api/latency/:dependencyId - Get latency stats for a dependency
router.get('/:dependencyId', getLatencyStats);

export default router;
