import { Router } from 'express';
import { requireAdmin } from '../../auth';
import { listUsers } from './list';
import { getUser } from './get';
import { updateUserRole } from './updateRole';
import { deactivateUser } from './deactivate';
import { reactivateUser } from './reactivate';
import { getCurrentUser } from './me';

const router = Router();

// Get current user profile - any authenticated user
router.get('/me', getCurrentUser);

// Admin-only user management
router.get('/', requireAdmin, listUsers);
router.get('/:id', requireAdmin, getUser);
router.put('/:id/role', requireAdmin, updateUserRole);
router.post('/:id/reactivate', requireAdmin, reactivateUser);
router.delete('/:id', requireAdmin, deactivateUser);

export default router;
