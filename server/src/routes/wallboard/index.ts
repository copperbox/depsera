import { Router } from 'express';
import { getWallboard } from './getWallboard';

const router = Router();

// GET /api/wallboard - Get dependency-focused wallboard data
router.get('/', getWallboard);

export default router;
