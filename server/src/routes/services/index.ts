import { Router } from 'express';
import { requireAuth, requireBodyTeamLead, requireServiceTeamAccess, requireServiceTeamLead } from '../../auth';
import { listServices } from './list';
import { getService } from './get';
import { createService } from './create';
import { updateService } from './update';
import { deleteService } from './delete';
import { pollServiceNow } from './poll';
import { testSchema } from './testSchema';

const router = Router();

// Read requires auth; results scoped to user's teams (unless admin)
router.get('/', requireAuth, listServices);
router.get('/:id', requireAuth, getService);

// Write requires team lead (of the service's team) or admin
router.post('/test-schema', requireAuth, testSchema);
router.post('/', requireBodyTeamLead, createService);
router.put('/:id', requireServiceTeamLead, updateService);
router.delete('/:id', requireServiceTeamLead, deleteService);

// Trigger immediate poll requires team membership (not just lead)
router.post('/:id/poll', requireServiceTeamAccess, pollServiceNow);

export default router;
