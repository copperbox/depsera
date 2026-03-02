import { Router } from 'express';
import { requireAdmin } from '../../auth';
import { getAuditLog } from './auditLog';
import { getSettings, updateSettings } from './settings';
import { listManifests, syncAllManifests } from './manifests';

const router = Router();

router.get('/audit-log', requireAdmin, getAuditLog);
router.get('/settings', requireAdmin, getSettings);
router.put('/settings', requireAdmin, updateSettings);
router.get('/manifests', requireAdmin, listManifests);
router.post('/manifests/sync-all', requireAdmin, syncAllManifests);

export default router;
