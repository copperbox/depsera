import { Router } from 'express';
import { getErrorHistory } from './getErrorHistory';

const router = Router();

// GET /api/errors/:dependencyId - Get error history for a dependency
router.get('/:dependencyId', getErrorHistory);

export default router;
