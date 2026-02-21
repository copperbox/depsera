import { Router } from 'express';
import { requireAdmin } from '../../auth';
import { getAuditLog } from './auditLog';
import { getSettings, updateSettings } from './settings';

const router = Router();

router.get('/audit-log', requireAdmin, getAuditLog);
router.get('/settings', requireAdmin, getSettings);
router.put('/settings', requireAdmin, updateSettings);

export default router;
