import { Router } from 'express';
import { listTeams } from './list';
import { getTeam } from './get';
import { createTeam } from './create';
import { updateTeam } from './update';
import { deleteTeam } from './delete';
import { addMember } from './members/add';
import { updateMember } from './members/update';
import { removeMember } from './members/remove';

const router = Router();

// Team CRUD
router.get('/', listTeams);
router.get('/:id', getTeam);
router.post('/', createTeam);
router.put('/:id', updateTeam);
router.delete('/:id', deleteTeam);

// Team member management
router.post('/:id/members', addMember);
router.put('/:id/members/:userId', updateMember);
router.delete('/:id/members/:userId', removeMember);

export default router;
