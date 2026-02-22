import { Router } from 'express';
import { requireAdmin, requireLocalAuth } from '../../auth';
import { listUsers } from './list';
import { getUser } from './get';
import { createUser } from './create';
import { updateUserRole } from './updateRole';
import { deactivateUser } from './deactivate';
import { reactivateUser } from './reactivate';
import { resetPassword } from './resetPassword';
import { getCurrentUser } from './me';

const router = Router();

// Get current user profile - any authenticated user
router.get('/me', getCurrentUser);

// Admin-only user management
router.get('/', requireAdmin, listUsers);
router.get('/:id', requireAdmin, getUser);
router.post('/', requireAdmin, requireLocalAuth, createUser);
router.put('/:id/role', requireAdmin, updateUserRole);
router.put('/:id/password', requireAdmin, requireLocalAuth, resetPassword);
router.post('/:id/reactivate', requireAdmin, reactivateUser);
router.delete('/:id', requireAdmin, deactivateUser);

export default router;
