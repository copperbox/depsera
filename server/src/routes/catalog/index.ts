import { Router } from 'express';
import { requireAuth } from '../../auth';
import { listExternalDependencies } from './externalDependencies';

const router = Router();

router.get('/external-dependencies', requireAuth, listExternalDependencies);

export default router;
