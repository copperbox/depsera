import { Router, Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

const router = Router();

// GET /api/external-nodes - List all external node enrichment records
router.get('/', (req: Request, res: Response) => {
  try {
    const stores = getStores();
    const enrichments = stores.externalNodeEnrichment.findAll();
    res.status(200).json(enrichments);
  } catch (error) /* istanbul ignore next */ {
    sendErrorResponse(res, error, 'listing external node enrichments');
  }
});

// PUT /api/external-nodes/:canonicalName - Upsert enrichment for an external node
router.put('/:canonicalName', (req: Request, res: Response) => {
  try {
    const { canonicalName } = req.params;
    const stores = getStores();

    const { displayName, description, impact, contact, serviceType } = req.body;

    const enrichment = stores.externalNodeEnrichment.upsert({
      canonical_name: canonicalName,
      display_name: displayName ?? null,
      description: description ?? null,
      impact: impact ?? null,
      contact: contact ? JSON.stringify(contact) : null,
      service_type: serviceType ?? null,
      updated_by: req.user?.id ?? null,
    });

    res.status(200).json(enrichment);
  } catch (error) /* istanbul ignore next */ {
    sendErrorResponse(res, error, 'upserting external node enrichment');
  }
});

// DELETE /api/external-nodes/:canonicalName - Remove enrichment for an external node
router.delete('/:canonicalName', (req: Request, res: Response) => {
  try {
    const { canonicalName } = req.params;
    const stores = getStores();

    const existing = stores.externalNodeEnrichment.findByCanonicalName(canonicalName);
    if (!existing) {
      res.status(404).json({ error: 'External node enrichment not found' });
      return;
    }

    stores.externalNodeEnrichment.delete(existing.id);
    res.status(204).send();
  } catch (error) /* istanbul ignore next */ {
    sendErrorResponse(res, error, 'deleting external node enrichment');
  }
});

export default router;
