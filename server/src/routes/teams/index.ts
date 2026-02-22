import { Router } from 'express';
import { requireAdmin } from '../../auth';
import { listTeams } from './list';
import { getTeam } from './get';
import { createTeam } from './create';
import { updateTeam } from './update';
import { deleteTeam } from './delete';
import { addMember } from './members/add';
import { updateMember } from './members/update';
import { removeMember } from './members/remove';

const router = Router();

// Team CRUD - read is open to authenticated users, write requires admin
router.get('/', listTeams);
router.get('/:id', getTeam);
router.post('/', requireAdmin, createTeam);
router.put('/:id', requireAdmin, updateTeam);
router.delete('/:id', requireAdmin, deleteTeam);

// Team member management - admin only
router.post('/:id/members', requireAdmin, addMember);
router.put('/:id/members/:userId', requireAdmin, updateMember);
router.delete('/:id/members/:userId', requireAdmin, removeMember);

export default router;
