import { Router } from 'express';
import { requireBodyTeamLead, requireServiceTeamLead } from '../../auth';
import { listServices } from './list';
import { getService } from './get';
import { createService } from './create';
import { updateService } from './update';
import { deleteService } from './delete';

const router = Router();

// Read is open to authenticated users
router.get('/', listServices);
router.get('/:id', getService);

// Write requires team lead (of the service's team) or admin
router.post('/', requireBodyTeamLead, createService);
router.put('/:id', requireServiceTeamLead, updateService);
router.delete('/:id', requireServiceTeamLead, deleteService);

export default router;
