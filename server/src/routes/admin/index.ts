import { Router } from 'express';
import { requireAdmin } from '../../auth';
import { getAuditLog } from './auditLog';

const router = Router();

router.get('/audit-log', requireAdmin, getAuditLog);

export default router;
