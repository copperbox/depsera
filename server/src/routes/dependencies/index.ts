import { Router } from 'express';
import { getHealthTimeline } from './getHealthTimeline';

const router = Router();

// GET /api/dependencies/:id/timeline - Get health state timeline for a dependency
router.get('/:id/timeline', getHealthTimeline);

export default router;
