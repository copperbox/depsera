import { Router } from 'express';
import { requireAdmin } from '../../auth';
import { getAliases } from './getAliases';
import { createAlias } from './createAlias';
import { updateAlias } from './updateAlias';
import { deleteAlias } from './deleteAlias';
import { getCanonicalNames } from './getCanonicalNames';

const router = Router();

// Read endpoints — any authenticated user
router.get('/', getAliases);
router.get('/canonical-names', getCanonicalNames);

// Mutation endpoints — admin only
router.post('/', requireAdmin, createAlias);
router.put('/:id', requireAdmin, updateAlias);
router.delete('/:id', requireAdmin, deleteAlias);

export default router;
