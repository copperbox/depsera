import { Router } from 'express';
import { getLatencyStats } from './getLatencyStats';
import { getLatencyBuckets } from './getLatencyBuckets';
import { getAggregateLatencyBuckets } from './getAggregateLatencyBuckets';

const router = Router();

// GET /api/latency/aggregate/buckets - Get aggregated latency buckets across multiple dependencies
router.get('/aggregate/buckets', getAggregateLatencyBuckets);

// GET /api/latency/:dependencyId/buckets - Get time-bucketed latency data for charts
router.get('/:dependencyId/buckets', getLatencyBuckets);

// GET /api/latency/:dependencyId - Get latency stats for a dependency
router.get('/:dependencyId', getLatencyStats);

export default router;
