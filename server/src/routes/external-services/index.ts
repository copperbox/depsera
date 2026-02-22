import { Router } from 'express';
import { requireAuth, requireBodyTeamLead, requireServiceTeamLead } from '../../auth';
import { listExternalServices } from './list';
import { createExternalService } from './create';
import { updateExternalService } from './update';
import { deleteExternalService } from './delete';

const router = Router();

// Read requires auth; results scoped to user's teams (unless admin)
router.get('/', requireAuth, listExternalServices);

// Write requires team lead (of the service's team) or admin
router.post('/', requireBodyTeamLead, createExternalService);
router.put('/:id', requireServiceTeamLead, updateExternalService);
router.delete('/:id', requireServiceTeamLead, deleteExternalService);

export default router;
