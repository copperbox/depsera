import { Router } from 'express';
import { listRecentActivity } from './list';
import { listUnstableDependencies } from './unstable';

const router = Router();

router.get('/recent', listRecentActivity);
router.get('/unstable', listUnstableDependencies);

export default router;
