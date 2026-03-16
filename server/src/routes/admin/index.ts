import { Router } from 'express';
import { requireAdmin } from '../../auth';
import { getAuditLog } from './auditLog';
import { getSettings, updateSettings } from './settings';
import { listManifests, syncAllManifests } from './manifests';
import { listAdminAlertMutes } from './alertMutes';
import { getAdminOtlpStats } from './otlpStats';

const router = Router();

router.get('/audit-log', requireAdmin, getAuditLog);
router.get('/settings', requireAdmin, getSettings);
router.put('/settings', requireAdmin, updateSettings);
router.get('/manifests', requireAdmin, listManifests);
router.post('/manifests/sync-all', requireAdmin, syncAllManifests);
router.get('/alert-mutes', requireAdmin, listAdminAlertMutes);
router.get('/otlp-stats', requireAdmin, getAdminOtlpStats);

export default router;
