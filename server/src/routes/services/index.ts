import { Router } from 'express';
import { listServices } from './list';
import { getService } from './get';
import { createService } from './create';
import { updateService } from './update';
import { deleteService } from './delete';

const router = Router();

router.get('/', listServices);
router.get('/:id', getService);
router.post('/', createService);
router.put('/:id', updateService);
router.delete('/:id', deleteService);

export default router;
