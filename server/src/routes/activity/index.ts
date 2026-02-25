import { Router } from 'express';
import { listRecentActivity } from './list';

const router = Router();

router.get('/recent', listRecentActivity);

export default router;
