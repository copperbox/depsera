import { Router } from 'express';
import { listUsers } from './list';
import { getUser } from './get';
import { updateUserRole } from './updateRole';
import { deactivateUser } from './deactivate';
import { reactivateUser } from './reactivate';
import { getCurrentUser } from './me';

const router = Router();

// Get current user profile (must be before /:id to avoid conflict)
router.get('/me', getCurrentUser);

// List all users
router.get('/', listUsers);

// Get user by ID
router.get('/:id', getUser);

// Update user role
router.put('/:id/role', updateUserRole);

// Reactivate user
router.post('/:id/reactivate', reactivateUser);

// Deactivate user
router.delete('/:id', deactivateUser);

export default router;
