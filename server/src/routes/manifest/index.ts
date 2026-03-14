import { Router, Request, Response } from 'express';
import { requireTeamAccess, requireTeamLead } from '../../auth';
import { getStores } from '../../stores';
import { sendErrorResponse, ValidationError, NotFoundError } from '../../utils/errors';
import { validateUrlHostname } from '../../utils/ssrf';
import { ManifestSyncService } from '../../services/manifest/ManifestSyncService';
import { validateManifest as runManifestValidation } from '../../services/manifest/ManifestValidator';
import { fetchManifest } from '../../services/manifest/ManifestFetcher';
import { auditFromRequest } from '../../services/audit/AuditLogService';
import type { ManifestSyncPolicy, ManifestConfigUpdateInput } from '../../services/manifest/types';

// --- Validation helpers ---

const VALID_FIELD_DRIFT_POLICIES = ['flag', 'manifest_wins', 'local_wins'] as const;
const VALID_REMOVAL_POLICIES = ['flag', 'deactivate', 'delete'] as const;
const VALID_METADATA_REMOVAL_POLICIES = ['remove', 'keep'] as const;
const MAX_NAME_LENGTH = 100;

function validateSyncPolicy(policy: unknown): Partial<ManifestSyncPolicy> | undefined {
  if (policy === undefined || policy === null) return undefined;
  if (typeof policy !== 'object' || Array.isArray(policy)) {
    throw new ValidationError('sync_policy must be an object', 'sync_policy');
  }

  const p = policy as Record<string, unknown>;
  const validated: Partial<ManifestSyncPolicy> = {};

  if (p.on_field_drift !== undefined) {
    if (!VALID_FIELD_DRIFT_POLICIES.includes(p.on_field_drift as typeof VALID_FIELD_DRIFT_POLICIES[number])) {
      throw new ValidationError(
        `on_field_drift must be one of: ${VALID_FIELD_DRIFT_POLICIES.join(', ')}`,
        'sync_policy.on_field_drift',
      );
    }
    validated.on_field_drift = p.on_field_drift as ManifestSyncPolicy['on_field_drift'];
  }

  if (p.on_removal !== undefined) {
    if (!VALID_REMOVAL_POLICIES.includes(p.on_removal as typeof VALID_REMOVAL_POLICIES[number])) {
      throw new ValidationError(
        `on_removal must be one of: ${VALID_REMOVAL_POLICIES.join(', ')}`,
        'sync_policy.on_removal',
      );
    }
    validated.on_removal = p.on_removal as ManifestSyncPolicy['on_removal'];
  }

  if (p.on_alias_removal !== undefined) {
    if (!VALID_METADATA_REMOVAL_POLICIES.includes(p.on_alias_removal as typeof VALID_METADATA_REMOVAL_POLICIES[number])) {
      throw new ValidationError(
        `on_alias_removal must be one of: ${VALID_METADATA_REMOVAL_POLICIES.join(', ')}`,
        'sync_policy.on_alias_removal',
      );
    }
    validated.on_alias_removal = p.on_alias_removal as ManifestSyncPolicy['on_alias_removal'];
  }

  if (p.on_override_removal !== undefined) {
    if (!VALID_METADATA_REMOVAL_POLICIES.includes(p.on_override_removal as typeof VALID_METADATA_REMOVAL_POLICIES[number])) {
      throw new ValidationError(
        `on_override_removal must be one of: ${VALID_METADATA_REMOVAL_POLICIES.join(', ')}`,
        'sync_policy.on_override_removal',
      );
    }
    validated.on_override_removal = p.on_override_removal as ManifestSyncPolicy['on_override_removal'];
  }

  if (p.on_association_removal !== undefined) {
    if (!VALID_METADATA_REMOVAL_POLICIES.includes(p.on_association_removal as typeof VALID_METADATA_REMOVAL_POLICIES[number])) {
      throw new ValidationError(
        `on_association_removal must be one of: ${VALID_METADATA_REMOVAL_POLICIES.join(', ')}`,
        'sync_policy.on_association_removal',
      );
    }
    validated.on_association_removal = p.on_association_removal as ManifestSyncPolicy['on_association_removal'];
  }

  return validated;
}

function validateManifestUrl(url: unknown): string {
  if (!url || typeof url !== 'string') {
    throw new ValidationError('manifest_url is required', 'manifest_url');
  }

  const trimmed = url.trim();
  if (!trimmed) {
    throw new ValidationError('manifest_url is required', 'manifest_url');
  }

  // Basic URL format check
  try {
    new URL(trimmed);
  } catch {
    throw new ValidationError('manifest_url must be a valid URL', 'manifest_url');
  }

  // SSRF hostname check (synchronous)
  try {
    validateUrlHostname(trimmed);
  } catch (err) {
    throw new ValidationError(
      `manifest_url is not allowed: ${err instanceof Error ? err.message : 'blocked'}`,
      'manifest_url',
    );
  }

  return trimmed;
}

function validateName(name: unknown): string {
  if (!name || typeof name !== 'string') {
    throw new ValidationError('name is required', 'name');
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ValidationError('name is required', 'name');
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`name must be at most ${MAX_NAME_LENGTH} characters`, 'name');
  }
  return trimmed;
}

// --- Multi-config routes ---

function listManifestConfigs(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const stores = getStores();
    const configs = stores.manifestConfig.findByTeamId(teamId);
    res.json({ configs });
  } catch (error) {
    sendErrorResponse(res, error, 'listing manifest configs');
  }
}

function createManifestConfig(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const stores = getStores();

    const name = validateName(req.body.name);
    const manifestUrl = validateManifestUrl(req.body.manifest_url);
    const syncPolicy = validateSyncPolicy(req.body.sync_policy);

    // Check name uniqueness within team
    const existing = stores.manifestConfig.findByTeamId(teamId);
    if (existing.some(c => c.name === name)) {
      throw new ValidationError(`A manifest config named "${name}" already exists for this team`, 'name');
    }

    const config = stores.manifestConfig.create({
      team_id: teamId,
      name,
      manifest_url: manifestUrl,
      is_enabled: req.body.is_enabled !== undefined ? Boolean(req.body.is_enabled) : undefined,
      sync_policy: syncPolicy as ManifestSyncPolicy | undefined,
    });

    auditFromRequest(
      req,
      'manifest_config.created',
      'team',
      teamId,
      { config_id: config.id, name, manifest_url: manifestUrl },
    );

    res.status(201).json({ config });
  } catch (error) {
    sendErrorResponse(res, error, 'creating manifest config');
  }
}

function getManifestConfig(req: Request, res: Response): void {
  try {
    const { id: teamId, configId } = req.params;
    const stores = getStores();

    const config = stores.manifestConfig.findById(configId);
    if (!config || config.team_id !== teamId) {
      throw new NotFoundError('ManifestConfig');
    }

    res.json({ config });
  } catch (error) {
    sendErrorResponse(res, error, 'getting manifest config');
  }
}

function updateManifestConfig(req: Request, res: Response): void {
  try {
    const { id: teamId, configId } = req.params;
    const stores = getStores();

    const existing = stores.manifestConfig.findById(configId);
    if (!existing || existing.team_id !== teamId) {
      throw new NotFoundError('ManifestConfig');
    }

    const updateInput: ManifestConfigUpdateInput = {};

    if (req.body.name !== undefined) {
      const name = validateName(req.body.name);
      // Check name uniqueness within team (excluding this config)
      const others = stores.manifestConfig.findByTeamId(teamId);
      if (others.some(c => c.id !== configId && c.name === name)) {
        throw new ValidationError(`A manifest config named "${name}" already exists for this team`, 'name');
      }
      updateInput.name = name;
    }

    if (req.body.manifest_url !== undefined) {
      updateInput.manifest_url = validateManifestUrl(req.body.manifest_url);
    }

    const syncPolicy = validateSyncPolicy(req.body.sync_policy);
    if (syncPolicy) {
      updateInput.sync_policy = syncPolicy;
    }

    if (req.body.is_enabled !== undefined) {
      updateInput.is_enabled = Boolean(req.body.is_enabled);
    }

    const config = stores.manifestConfig.update(configId, updateInput);

    auditFromRequest(
      req,
      'manifest_config.updated',
      'team',
      teamId,
      { config_id: configId },
    );

    res.json({ config });
  } catch (error) {
    sendErrorResponse(res, error, 'updating manifest config');
  }
}

function deleteManifestConfig(req: Request, res: Response): void {
  try {
    const { id: teamId, configId } = req.params;
    const stores = getStores();

    const existing = stores.manifestConfig.findById(configId);
    if (!existing || existing.team_id !== teamId) {
      throw new NotFoundError('ManifestConfig');
    }

    stores.manifestConfig.delete(configId);

    auditFromRequest(
      req,
      'manifest_config.deleted',
      'team',
      teamId,
      { config_id: configId, name: existing.name },
    );

    res.status(204).send();
  } catch (error) {
    sendErrorResponse(res, error, 'deleting manifest config');
  }
}

// --- Sync routes ---

async function triggerTeamSync(req: Request, res: Response): Promise<void> {
  try {
    const teamId = req.params.id;
    const stores = getStores();
    const syncService = ManifestSyncService.getInstance();

    const configs = stores.manifestConfig.findByTeamId(teamId)
      .filter(c => c.is_enabled === 1);

    if (configs.length === 0) {
      res.status(404).json({ error: 'No enabled manifest configs for this team' });
      return;
    }

    // Check if any are already syncing
    if (syncService.isSyncing(teamId)) {
      res.status(409).json({ error: 'Sync already in progress' });
      return;
    }

    const result = await syncService.syncTeam(teamId, 'manual', req.user!.id);
    res.json({ result });
  } catch (error) {
    sendErrorResponse(res, error, 'triggering team manifest sync');
  }
}

async function triggerConfigSync(req: Request, res: Response): Promise<void> {
  try {
    const { id: teamId, configId } = req.params;
    const stores = getStores();
    const syncService = ManifestSyncService.getInstance();

    const config = stores.manifestConfig.findById(configId);
    if (!config || config.team_id !== teamId) {
      res.status(404).json({ error: 'Manifest config not found' });
      return;
    }

    if (!config.is_enabled) {
      res.status(400).json({ error: 'Manifest sync is disabled for this config' });
      return;
    }

    if (syncService.isSyncingConfig(configId)) {
      res.status(409).json({ error: 'Sync already in progress for this config' });
      return;
    }

    const cooldownCheck = syncService.canManualSync(configId);
    if (!cooldownCheck.allowed) {
      const retryAfterSeconds = Math.ceil((cooldownCheck.retryAfterMs ?? 60000) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: 'Please wait before syncing again',
        retry_after_ms: cooldownCheck.retryAfterMs,
      });
      return;
    }

    const result = await syncService.syncManifest(configId, 'manual', req.user!.id);
    res.json({ result });
  } catch (error) {
    sendErrorResponse(res, error, 'triggering manifest config sync');
  }
}

function getConfigSyncHistory(req: Request, res: Response): void {
  try {
    const { id: teamId, configId } = req.params;
    const stores = getStores();

    const config = stores.manifestConfig.findById(configId);
    if (!config || config.team_id !== teamId) {
      throw new NotFoundError('ManifestConfig');
    }

    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit), 10) || 20, 1),
      100,
    );
    const offset = Math.max(parseInt(String(req.query.offset), 10) || 0, 0);

    const { history, total } = stores.manifestSyncHistory.findByConfigId(configId, { limit, offset });
    res.json({ history, total });
  } catch (error) {
    sendErrorResponse(res, error, 'listing config sync history');
  }
}

// --- Validation route ---

function validateManifestEndpoint(req: Request, res: Response): void {
  try {
    if (!req.body || typeof req.body !== 'object') {
      throw new ValidationError('Request body must be a JSON object');
    }

    const result = runManifestValidation(req.body);
    res.json({ result });
  } catch (error) {
    sendErrorResponse(res, error, 'validating manifest');
  }
}

// --- Test URL route ---

async function testManifestUrl(req: Request, res: Response): Promise<void> {
  try {
    const url = req.body?.url;
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new ValidationError('url is required', 'url');
    }

    const trimmedUrl = url.trim();

    // Basic URL format check
    try {
      new URL(trimmedUrl);
    } catch {
      throw new ValidationError('url must be a valid URL', 'url');
    }

    // SSRF hostname check (synchronous)
    try {
      validateUrlHostname(trimmedUrl);
    } catch (err) {
      throw new ValidationError(
        `URL is not allowed: ${err instanceof Error ? err.message : 'blocked'}`,
        'url',
      );
    }

    // Fetch the manifest
    const fetchResult = await fetchManifest(trimmedUrl);

    if (!fetchResult.success) {
      res.json({
        result: {
          fetch_success: false,
          fetch_error: fetchResult.error,
          validation: null,
        },
      });
      return;
    }

    // Validate the fetched manifest
    const validation = runManifestValidation(fetchResult.data);

    res.json({
      result: {
        fetch_success: true,
        fetch_error: null,
        validation,
      },
    });
  } catch (error) {
    sendErrorResponse(res, error, 'testing manifest URL');
  }
}

// --- Router setup ---

/**
 * Team-scoped manifest routes.
 * Mounted under /api/teams via: app.use('/api/teams', requireAuth, manifestTeamRouter)
 *
 * Routes:
 *   GET    /:id/manifests                        — list all configs for team
 *   POST   /:id/manifests                        — create new config
 *   POST   /:id/manifests/sync                   — sync all enabled configs for team
 *   GET    /:id/manifests/:configId               — get single config
 *   PUT    /:id/manifests/:configId               — update config
 *   DELETE /:id/manifests/:configId               — remove config
 *   POST   /:id/manifests/:configId/sync          — sync single config
 *   GET    /:id/manifests/:configId/sync-history   — history for specific config
 */
const manifestTeamRouter = Router();

manifestTeamRouter.get('/:id/manifests', requireTeamAccess, listManifestConfigs);
manifestTeamRouter.post('/:id/manifests', requireTeamLead, createManifestConfig);
manifestTeamRouter.post('/:id/manifests/sync', requireTeamAccess, triggerTeamSync);
manifestTeamRouter.get('/:id/manifests/:configId', requireTeamAccess, getManifestConfig);
manifestTeamRouter.put('/:id/manifests/:configId', requireTeamLead, updateManifestConfig);
manifestTeamRouter.delete('/:id/manifests/:configId', requireTeamLead, deleteManifestConfig);
manifestTeamRouter.post('/:id/manifests/:configId/sync', requireTeamAccess, triggerConfigSync);
manifestTeamRouter.get('/:id/manifests/:configId/sync-history', requireTeamAccess, getConfigSyncHistory);

/**
 * Standalone manifest routes (not team-scoped).
 * Mounted at /api/manifest via: app.use('/api/manifest', requireAuth, manifestRouter)
 *
 * Routes:
 *   POST /validate — validate manifest JSON (dry run)
 *   POST /test-url — fetch and validate from URL
 */
const manifestRouter = Router();

manifestRouter.post('/validate', validateManifestEndpoint);
manifestRouter.post('/test-url', testManifestUrl);

export { manifestTeamRouter, manifestRouter };
export default manifestTeamRouter;
