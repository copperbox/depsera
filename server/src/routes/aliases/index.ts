import { Router } from 'express';
import { getAliases } from './getAliases';
import { createAlias } from './createAlias';
import { updateAlias } from './updateAlias';
import { deleteAlias } from './deleteAlias';
import { getCanonicalNames } from './getCanonicalNames';

const router = Router();

router.get('/', getAliases);
router.post('/', createAlias);
router.get('/canonical-names', getCanonicalNames);
router.put('/:id', updateAlias);
router.delete('/:id', deleteAlias);

export default router;
