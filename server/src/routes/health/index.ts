import { Router } from 'express';
import { getHealth } from './get';

const router = Router();

router.get('/', getHealth);

export default router;
