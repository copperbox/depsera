import { Router } from 'express';
import { getCanonicalOverrides } from './getCanonicalOverrides';
import { getCanonicalOverride } from './getCanonicalOverride';
import { upsertCanonicalOverride } from './upsertCanonicalOverride';
import { deleteCanonicalOverride } from './deleteCanonicalOverride';

const router = Router();

// Read endpoints — any authenticated user
router.get('/', getCanonicalOverrides);
router.get('/:canonicalName', getCanonicalOverride);

// Mutation endpoints — permission checked in handler (admin or team lead of relevant team)
router.put('/:canonicalName', upsertCanonicalOverride);
router.delete('/:canonicalName', deleteCanonicalOverride);

export default router;
