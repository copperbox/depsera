import { Router, Request, Response } from 'express';
import { requireTeamLead } from '../../auth';
import { getStores } from '../../stores';
import { sendErrorResponse, ValidationError } from '../../utils/errors';

const router = Router({ mergeParams: true });

/**
 * GET /api/teams/:id/api-keys
 * List API keys for a team (team lead/admin only). Never returns raw key.
 */
router.get('/', requireTeamLead, (req: Request, res: Response): void => {
  try {
    const teamId = req.params.id;
    const stores = getStores();
    const keys = stores.teamApiKeys.findByTeamId(teamId);

    // Strip key_hash from response
    const sanitized = keys.map(({ key_hash: _hash, ...rest }) => rest);
    res.json(sanitized);
  } catch (error) {
    sendErrorResponse(res, error, 'listing API keys');
  }
});

/**
 * POST /api/teams/:id/api-keys
 * Create a new API key. Returns raw key once.
 */
router.post('/', requireTeamLead, (req: Request, res: Response): void => {
  try {
    const teamId = req.params.id;
    const stores = getStores();
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('Name is required', 'name');
    }

    const result = stores.teamApiKeys.create({
      team_id: teamId,
      name: name.trim(),
      created_by: req.user!.id,
    });

    // Audit log
    stores.auditLog.create({
      user_id: req.user!.id,
      action: 'api_key.created',
      resource_type: 'team_api_key',
      resource_id: result.id,
      details: JSON.stringify({
        team_id: teamId,
        key_name: result.name,
        key_prefix: result.key_prefix,
      }),
      ip_address: req.ip || null,
    });

    // Return raw key once (strip key_hash)
    const { key_hash: _hash, ...sanitized } = result;
    res.status(201).json(sanitized);
  } catch (error) {
    sendErrorResponse(res, error, 'creating API key');
  }
});

/**
 * DELETE /api/teams/:id/api-keys/:keyId
 * Revoke an API key.
 */
router.delete('/:keyId', requireTeamLead, (req: Request, res: Response): void => {
  try {
    const teamId = req.params.id;
    const keyId = req.params.keyId;
    const stores = getStores();

    // Verify key belongs to this team
    const keys = stores.teamApiKeys.findByTeamId(teamId);
    const key = keys.find((k) => k.id === keyId);
    if (!key) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    stores.teamApiKeys.delete(keyId);

    // Audit log
    stores.auditLog.create({
      user_id: req.user!.id,
      action: 'api_key.revoked',
      resource_type: 'team_api_key',
      resource_id: keyId,
      details: JSON.stringify({
        team_id: teamId,
        key_name: key.name,
        key_prefix: key.key_prefix,
      }),
      ip_address: req.ip || null,
    });

    res.status(204).send();
  } catch (error) {
    sendErrorResponse(res, error, 'revoking API key');
  }
});

export default router;
