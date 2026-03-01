import { Router, Request, Response } from 'express';
import { requireTeamAccess, requireTeamLead } from '../../auth';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';
import { ValidationError, AppError } from '../../utils/errors';
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

// --- Configuration routes (DPS-57a) ---

function getManifestConfig(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const stores = getStores();
    const config = stores.manifestConfig.findByTeamId(teamId);
    res.json({ config: config ?? null });
  } catch (error) {
    sendErrorResponse(res, error, 'getting manifest config');
  }
}

function saveManifestConfig(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const stores = getStores();

    const manifestUrl = validateManifestUrl(req.body.manifest_url);
    const syncPolicy = validateSyncPolicy(req.body.sync_policy);

    const existing = stores.manifestConfig.findByTeamId(teamId);

    let config;
    if (existing) {
      // Update existing config
      const updateInput: ManifestConfigUpdateInput = {
        manifest_url: manifestUrl,
      };
      if (syncPolicy) {
        updateInput.sync_policy = syncPolicy;
      }
      if (req.body.is_enabled !== undefined) {
        updateInput.is_enabled = Boolean(req.body.is_enabled);
      }
      config = stores.manifestConfig.update(teamId, updateInput);

      auditFromRequest(
        req,
        'manifest_config.updated',
        'team',
        teamId,
        { manifest_url: manifestUrl },
      );
    } else {
      // Create new config
      config = stores.manifestConfig.create({
        team_id: teamId,
        manifest_url: manifestUrl,
        is_enabled: req.body.is_enabled !== undefined ? Boolean(req.body.is_enabled) : undefined,
        sync_policy: syncPolicy as ManifestSyncPolicy | undefined,
      });

      auditFromRequest(
        req,
        'manifest_config.created',
        'team',
        teamId,
        { manifest_url: manifestUrl },
      );
    }

    res.json({ config });
  } catch (error) {
    sendErrorResponse(res, error, 'saving manifest config');
  }
}

function deleteManifestConfig(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const stores = getStores();

    stores.manifestConfig.delete(teamId);

    auditFromRequest(
      req,
      'manifest_config.deleted',
      'team',
      teamId,
    );

    res.status(204).send();
  } catch (error) {
    sendErrorResponse(res, error, 'deleting manifest config');
  }
}

// --- Sync routes (DPS-57b) ---

async function triggerSync(req: Request, res: Response): Promise<void> {
  try {
    const teamId = req.params.id;
    const stores = getStores();
    const syncService = ManifestSyncService.getInstance();

    // Check if config exists
    const config = stores.manifestConfig.findByTeamId(teamId);
    if (!config) {
      res.status(404).json({ error: 'No manifest configured for this team' });
      return;
    }

    // Check if disabled
    if (!config.is_enabled) {
      res.status(400).json({ error: 'Manifest sync is disabled for this team' });
      return;
    }

    // Check if already syncing
    if (syncService.isSyncing(teamId)) {
      res.status(409).json({ error: 'Sync already in progress' });
      return;
    }

    // Check cooldown
    const cooldownCheck = syncService.canManualSync(teamId);
    if (!cooldownCheck.allowed) {
      const retryAfterSeconds = Math.ceil((cooldownCheck.retryAfterMs ?? 60000) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: 'Please wait before syncing again',
        retry_after_ms: cooldownCheck.retryAfterMs,
      });
      return;
    }

    // Trigger sync
    const result = await syncService.syncTeam(teamId, 'manual', req.user!.id);
    res.json({ result });
  } catch (error) {
    sendErrorResponse(res, error, 'triggering manifest sync');
  }
}

function getSyncHistory(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const stores = getStores();

    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit), 10) || 20, 1),
      100,
    );
    const offset = Math.max(parseInt(String(req.query.offset), 10) || 0, 0);

    const { history, total } = stores.manifestSyncHistory.findByTeamId(teamId, { limit, offset });
    res.json({ history, total });
  } catch (error) {
    sendErrorResponse(res, error, 'listing sync history');
  }
}

// --- Validation route (DPS-57c) ---

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
 *   GET    /:id/manifest             — get manifest config
 *   PUT    /:id/manifest             — create/update manifest config
 *   DELETE /:id/manifest             — remove manifest config
 *   POST   /:id/manifest/sync        — trigger manual sync
 *   GET    /:id/manifest/sync-history — list sync history
 */
const manifestTeamRouter = Router();

manifestTeamRouter.get('/:id/manifest', requireTeamAccess, getManifestConfig);
manifestTeamRouter.put('/:id/manifest', requireTeamLead, saveManifestConfig);
manifestTeamRouter.delete('/:id/manifest', requireTeamLead, deleteManifestConfig);
manifestTeamRouter.post('/:id/manifest/sync', requireTeamAccess, triggerSync);
manifestTeamRouter.get('/:id/manifest/sync-history', requireTeamAccess, getSyncHistory);

/**
 * Standalone manifest routes (not team-scoped).
 * Mounted at /api/manifest via: app.use('/api/manifest', requireAuth, manifestRouter)
 *
 * Routes:
 *   POST /validate — validate manifest JSON (dry run)
 */
const manifestRouter = Router();

manifestRouter.post('/validate', validateManifestEndpoint);
manifestRouter.post('/test-url', testManifestUrl);

export { manifestTeamRouter, manifestRouter };
export default manifestTeamRouter;
