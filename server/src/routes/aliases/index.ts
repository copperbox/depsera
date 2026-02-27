import { Router } from 'express';
import { getAliases } from './getAliases';
import { createAlias } from './createAlias';
import { updateAlias } from './updateAlias';
import { deleteAlias } from './deleteAlias';
import { getCanonicalNames } from './getCanonicalNames';

const router = Router();

// Read endpoints — any authenticated user
router.get('/', getAliases);
router.get('/canonical-names', getCanonicalNames);

// Mutation endpoints — admin or team lead (authorization checked in handlers)
router.post('/', createAlias);
router.put('/:id', updateAlias);
router.delete('/:id', deleteAlias);

export default router;
