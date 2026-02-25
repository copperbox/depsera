import { Router } from 'express';
import { getHealthTimeline } from './getHealthTimeline';
import { putOverride } from './putOverride';
import { deleteOverride } from './deleteOverride';

const router = Router();

// GET /api/dependencies/:id/timeline - Get health state timeline for a dependency
router.get('/:id/timeline', getHealthTimeline);

// PUT /api/dependencies/:id/overrides - Set per-instance overrides
router.put('/:id/overrides', putOverride);

// DELETE /api/dependencies/:id/overrides - Clear all per-instance overrides
router.delete('/:id/overrides', deleteOverride);

export default router;
