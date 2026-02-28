import { Router, Request, Response } from 'express';
import { requireTeamAccess, requireTeamLead } from '../../auth';
import { getStores } from '../../stores';
import { withTransaction } from '../../stores/transaction';
import { sendErrorResponse, ValidationError, NotFoundError, ConflictError } from '../../utils/errors';
import { validateUrlHostname } from '../../utils/ssrf';
import { auditFromRequest } from '../../services/audit/AuditLogService';
import { HealthPollingService } from '../../services/polling/HealthPollingService';
import type { DriftFlag, DriftFlagStatus, DriftType, BulkDriftActionResult } from '../../db/types';

// --- Syncable field definitions ---

/** Fields that are URL-type and require SSRF re-validation on accept. */
const URL_FIELDS = new Set(['health_endpoint', 'metrics_endpoint']);

/** Fields that map directly to service columns. */
const SYNCABLE_FIELDS = new Set([
  'name',
  'health_endpoint',
  'description',
  'metrics_endpoint',
  'poll_interval_ms',
  'schema_config',
]);

/** Fields that require polling restart when changed. */
const POLLING_RESTART_FIELDS = new Set(['health_endpoint', 'poll_interval_ms']);

// --- Validation helpers ---

function parseStatus(value: unknown): DriftFlagStatus | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const valid: DriftFlagStatus[] = ['pending', 'dismissed', 'accepted', 'resolved'];
  if (typeof value === 'string' && valid.includes(value as DriftFlagStatus)) {
    return value as DriftFlagStatus;
  }
  throw new ValidationError(`status must be one of: ${valid.join(', ')}`, 'status');
}

function parseDriftType(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const valid: DriftType[] = ['field_change', 'service_removal'];
  if (typeof value === 'string' && valid.includes(value as DriftType)) {
    return value as DriftType;
  }
  throw new ValidationError(`drift_type must be one of: ${valid.join(', ')}`, 'drift_type');
}

function parseLimit(value: unknown, max: number, defaultVal: number): number {
  if (value === undefined || value === null || value === '') return defaultVal;
  const n = parseInt(String(value), 10);
  if (isNaN(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}

function parseOffset(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = parseInt(String(value), 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

function validateFlagIds(body: unknown): string[] {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }
  const { flag_ids } = body as Record<string, unknown>;
  if (!Array.isArray(flag_ids)) {
    throw new ValidationError('flag_ids must be an array', 'flag_ids');
  }
  if (flag_ids.length === 0) {
    throw new ValidationError('flag_ids must not be empty', 'flag_ids');
  }
  if (flag_ids.length > 100) {
    throw new ValidationError('flag_ids must not exceed 100 items', 'flag_ids');
  }
  if (!flag_ids.every((id) => typeof id === 'string' && id.length > 0)) {
    throw new ValidationError('flag_ids must contain non-empty strings', 'flag_ids');
  }
  return flag_ids as string[];
}

// --- Field-level accept helpers ---

/**
 * Validate that a manifest value is acceptable for the given field.
 * Throws ValidationError if validation fails.
 */
function validateFieldValue(fieldName: string, manifestValue: string | null): void {
  if (fieldName === 'poll_interval_ms' && manifestValue !== null) {
    const ms = parseInt(manifestValue, 10);
    if (isNaN(ms) || ms < 5000 || ms > 3600000) {
      throw new ValidationError(
        'poll_interval_ms must be between 5000 and 3600000',
        'poll_interval_ms',
      );
    }
  }

  if (fieldName === 'schema_config' && manifestValue !== null) {
    try {
      JSON.parse(manifestValue);
    } catch {
      throw new ValidationError('schema_config must be valid JSON', 'schema_config');
    }
  }

  if (URL_FIELDS.has(fieldName) && manifestValue !== null && manifestValue !== '') {
    try {
      new URL(manifestValue);
    } catch {
      throw new ValidationError(`${fieldName} must be a valid URL`, fieldName);
    }
    try {
      validateUrlHostname(manifestValue);
    } catch (err) {
      throw new ValidationError(
        `${fieldName} is not allowed: ${err instanceof Error ? err.message : 'blocked by SSRF policy'}`,
        fieldName,
      );
    }
  }
}

/**
 * Convert a manifest_value string to the appropriate type for the service column.
 */
function coerceFieldValue(fieldName: string, manifestValue: string | null): unknown {
  if (manifestValue === null) return null;
  if (fieldName === 'poll_interval_ms') return parseInt(manifestValue, 10);
  return manifestValue;
}

/**
 * Update manifest_last_synced_values snapshot after accepting a field change.
 * Merges the accepted field into the existing snapshot.
 */
function updateSyncedSnapshot(
  stores: ReturnType<typeof getStores>,
  serviceId: string,
  fieldName: string,
  manifestValue: string | null,
): void {
  const service = stores.services.findById(serviceId);
  if (!service) return;

  let snapshot: Record<string, unknown> = {};
  if (service.manifest_last_synced_values) {
    try {
      snapshot = JSON.parse(service.manifest_last_synced_values);
    } catch {
      // corrupt snapshot — start fresh
    }
  }

  // Convert the value to the same type stored in the snapshot
  snapshot[fieldName] = fieldName === 'poll_interval_ms' && manifestValue !== null
    ? parseInt(manifestValue, 10)
    : fieldName === 'schema_config' && manifestValue !== null
      ? JSON.parse(manifestValue)
      : manifestValue;

  const db = (stores.services as any).db;
  db.prepare('UPDATE services SET manifest_last_synced_values = ? WHERE id = ?')
    .run(JSON.stringify(snapshot), serviceId);
}

// --- List & Summary routes (DPS-58a) ---

function listDriftFlags(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const stores = getStores();

    const status = parseStatus(req.query.status) ?? 'pending';
    const drift_type = parseDriftType(req.query.drift_type);
    const service_id = typeof req.query.service_id === 'string' && req.query.service_id
      ? req.query.service_id
      : undefined;
    const limit = parseLimit(req.query.limit, 250, 50);
    const offset = parseOffset(req.query.offset);

    const { flags, total } = stores.driftFlags.findByTeamId(teamId, {
      status,
      drift_type,
      service_id,
      limit,
      offset,
    });

    // Always include summary regardless of filters
    const summary = stores.driftFlags.countByTeamId(teamId);

    res.json({ flags, summary, total });
  } catch (error) {
    sendErrorResponse(res, error, 'listing drift flags');
  }
}

function getDriftSummary(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const stores = getStores();
    const summary = stores.driftFlags.countByTeamId(teamId);
    res.json({ summary });
  } catch (error) {
    sendErrorResponse(res, error, 'getting drift summary');
  }
}

// --- Single flag action routes (DPS-58b) ---

function acceptDrift(req: Request, res: Response): void {
  try {
    const { id: teamId, driftId } = req.params;
    const stores = getStores();
    const userId = req.user!.id;

    // Load the flag
    const flag = stores.driftFlags.findById(driftId);
    if (!flag) throw new NotFoundError('DriftFlag');
    if (flag.team_id !== teamId) throw new NotFoundError('DriftFlag');

    // Cannot accept already accepted/resolved flags
    if (flag.status === 'accepted' || flag.status === 'resolved') {
      throw new ConflictError('Flag is already accepted or resolved');
    }

    let needsPollingRestart = false;

    if (flag.drift_type === 'field_change') {
      // Validate the manifest value before applying
      if (flag.field_name && SYNCABLE_FIELDS.has(flag.field_name)) {
        validateFieldValue(flag.field_name, flag.manifest_value);
      }

      // Apply the field change within a transaction
      withTransaction((txStores) => {
        if (flag.field_name && SYNCABLE_FIELDS.has(flag.field_name)) {
          const updateValue = coerceFieldValue(flag.field_name, flag.manifest_value);
          txStores.services.update(flag.service_id, {
            [flag.field_name]: updateValue,
          } as any);

          updateSyncedSnapshot(txStores, flag.service_id, flag.field_name, flag.manifest_value);

          if (POLLING_RESTART_FIELDS.has(flag.field_name)) {
            needsPollingRestart = true;
          }
        }

        txStores.driftFlags.resolve(driftId, 'accepted', userId);
      });

      // Restart polling outside of transaction
      if (needsPollingRestart) {
        try {
          HealthPollingService.getInstance().restartService(flag.service_id);
        } catch {
          // Non-fatal: polling restart failure doesn't invalidate the accept
        }
      }
    } else if (flag.drift_type === 'service_removal') {
      // Deactivate service and stop polling
      withTransaction((txStores) => {
        txStores.services.update(flag.service_id, { is_active: false });
        txStores.driftFlags.resolve(driftId, 'accepted', userId);
      });

      try {
        HealthPollingService.getInstance().stopService(flag.service_id);
      } catch {
        // Non-fatal
      }
    }

    // Audit log
    auditFromRequest(
      req,
      'drift.accepted',
      'service',
      flag.service_id,
      {
        drift_id: driftId,
        drift_type: flag.drift_type,
        field_name: flag.field_name,
        manifest_value: flag.manifest_value,
      },
    );

    // Reload flag with context for response
    const { flags } = stores.driftFlags.findByTeamId(teamId, { limit: 1, offset: 0 });
    const updatedFlag = flags.find(f => f.id === driftId)
      ?? stores.driftFlags.findById(driftId);

    res.json({ flag: updatedFlag });
  } catch (error) {
    sendErrorResponse(res, error, 'accepting drift flag');
  }
}

function dismissDrift(req: Request, res: Response): void {
  try {
    const { id: teamId, driftId } = req.params;
    const stores = getStores();
    const userId = req.user!.id;

    const flag = stores.driftFlags.findById(driftId);
    if (!flag) throw new NotFoundError('DriftFlag');
    if (flag.team_id !== teamId) throw new NotFoundError('DriftFlag');

    if (flag.status === 'accepted' || flag.status === 'resolved') {
      throw new ConflictError('Flag is already accepted or resolved');
    }

    stores.driftFlags.resolve(driftId, 'dismissed', userId);

    auditFromRequest(
      req,
      'drift.dismissed',
      'service',
      flag.service_id,
      { drift_id: driftId, drift_type: flag.drift_type },
    );

    // Reload with context
    const reloaded = reloadFlagWithContext(stores, teamId, driftId);
    res.json({ flag: reloaded });
  } catch (error) {
    sendErrorResponse(res, error, 'dismissing drift flag');
  }
}

function reopenDrift(req: Request, res: Response): void {
  try {
    const { id: teamId, driftId } = req.params;
    const stores = getStores();

    const flag = stores.driftFlags.findById(driftId);
    if (!flag) throw new NotFoundError('DriftFlag');
    if (flag.team_id !== teamId) throw new NotFoundError('DriftFlag');

    if (flag.status !== 'dismissed') {
      throw new ValidationError('Only dismissed flags can be reopened');
    }

    stores.driftFlags.reopen(driftId);

    auditFromRequest(
      req,
      'drift.reopened',
      'service',
      flag.service_id,
      { drift_id: driftId, drift_type: flag.drift_type },
    );

    const reloaded = reloadFlagWithContext(stores, teamId, driftId);
    res.json({ flag: reloaded });
  } catch (error) {
    sendErrorResponse(res, error, 'reopening drift flag');
  }
}

// --- Bulk action routes (DPS-58c) ---

function bulkAccept(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const flagIds = validateFlagIds(req.body);
    const stores = getStores();
    const userId = req.user!.id;

    const result: BulkDriftActionResult = { succeeded: 0, failed: 0, errors: [] };
    const pollingRestarts: Set<string> = new Set();
    const pollingStops: Set<string> = new Set();

    withTransaction((txStores) => {
      for (const flagId of flagIds) {
        try {
          const flag = txStores.driftFlags.findById(flagId);
          if (!flag || flag.team_id !== teamId) {
            result.failed++;
            result.errors.push({ flag_id: flagId, error: 'Flag not found' });
            continue;
          }
          if (flag.status === 'accepted' || flag.status === 'resolved') {
            result.failed++;
            result.errors.push({ flag_id: flagId, error: 'Flag already accepted or resolved' });
            continue;
          }

          if (flag.drift_type === 'field_change') {
            if (flag.field_name && SYNCABLE_FIELDS.has(flag.field_name)) {
              try {
                validateFieldValue(flag.field_name, flag.manifest_value);
              } catch (err) {
                result.failed++;
                result.errors.push({
                  flag_id: flagId,
                  error: err instanceof Error ? err.message : 'Validation failed',
                });
                continue;
              }

              const updateValue = coerceFieldValue(flag.field_name, flag.manifest_value);
              txStores.services.update(flag.service_id, {
                [flag.field_name]: updateValue,
              } as any);

              updateSyncedSnapshot(txStores, flag.service_id, flag.field_name, flag.manifest_value);

              if (POLLING_RESTART_FIELDS.has(flag.field_name)) {
                pollingRestarts.add(flag.service_id);
              }
            }

            txStores.driftFlags.resolve(flagId, 'accepted', userId);
            result.succeeded++;
          } else if (flag.drift_type === 'service_removal') {
            txStores.services.update(flag.service_id, { is_active: false });
            txStores.driftFlags.resolve(flagId, 'accepted', userId);
            pollingStops.add(flag.service_id);
            result.succeeded++;
          }
        } catch (err) {
          result.failed++;
          result.errors.push({
            flag_id: flagId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    });

    // Polling updates after transaction
    const pollingService = HealthPollingService.getInstance();
    for (const serviceId of pollingStops) {
      try { pollingService.stopService(serviceId); } catch { /* non-fatal */ }
    }
    for (const serviceId of pollingRestarts) {
      if (!pollingStops.has(serviceId)) {
        try { pollingService.restartService(serviceId); } catch { /* non-fatal */ }
      }
    }

    auditFromRequest(
      req,
      'drift.bulk_accepted',
      'team',
      teamId,
      { flag_count: flagIds.length, succeeded: result.succeeded, failed: result.failed },
    );

    res.json({ result });
  } catch (error) {
    sendErrorResponse(res, error, 'bulk accepting drift flags');
  }
}

function bulkDismiss(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const flagIds = validateFlagIds(req.body);
    const stores = getStores();
    const userId = req.user!.id;

    const result: BulkDriftActionResult = { succeeded: 0, failed: 0, errors: [] };

    withTransaction((txStores) => {
      for (const flagId of flagIds) {
        try {
          const flag = txStores.driftFlags.findById(flagId);
          if (!flag || flag.team_id !== teamId) {
            result.failed++;
            result.errors.push({ flag_id: flagId, error: 'Flag not found' });
            continue;
          }
          if (flag.status === 'accepted' || flag.status === 'resolved') {
            result.failed++;
            result.errors.push({ flag_id: flagId, error: 'Flag already accepted or resolved' });
            continue;
          }

          txStores.driftFlags.resolve(flagId, 'dismissed', userId);
          result.succeeded++;
        } catch (err) {
          result.failed++;
          result.errors.push({
            flag_id: flagId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    });

    auditFromRequest(
      req,
      'drift.bulk_dismissed',
      'team',
      teamId,
      { flag_count: flagIds.length, succeeded: result.succeeded, failed: result.failed },
    );

    res.json({ result });
  } catch (error) {
    sendErrorResponse(res, error, 'bulk dismissing drift flags');
  }
}

// --- Helpers ---

/**
 * Reload a drift flag with context (joined service name, etc.).
 * Falls back to raw flag if the team-scoped query doesn't find it.
 */
function reloadFlagWithContext(
  stores: ReturnType<typeof getStores>,
  teamId: string,
  flagId: string,
) {
  // Try to find via team query (returns DriftFlagWithContext)
  // We query with no status filter and limit=250 to search broadly
  const { flags } = stores.driftFlags.findByTeamId(teamId, { limit: 250, offset: 0 });
  const found = flags.find(f => f.id === flagId);
  if (found) return found;

  // Fallback: return the raw flag
  return stores.driftFlags.findById(flagId);
}

// --- Router setup ---

/**
 * Team-scoped drift flag routes.
 * Mounted under /api/teams via: app.use('/api/teams', requireAuth, driftRouter)
 *
 * Routes:
 *   GET    /:id/drifts              — list drift flags
 *   GET    /:id/drifts/summary      — badge counts only
 *   PUT    /:id/drifts/:driftId/accept  — accept drift flag
 *   PUT    /:id/drifts/:driftId/dismiss — dismiss drift flag
 *   PUT    /:id/drifts/:driftId/reopen  — reopen drift flag
 *   POST   /:id/drifts/bulk-accept  — bulk accept
 *   POST   /:id/drifts/bulk-dismiss — bulk dismiss
 */
const driftRouter = Router();

// List & Summary
driftRouter.get('/:id/drifts', requireTeamAccess, listDriftFlags);
driftRouter.get('/:id/drifts/summary', requireTeamAccess, getDriftSummary);

// Single actions
driftRouter.put('/:id/drifts/:driftId/accept', requireTeamLead, acceptDrift);
driftRouter.put('/:id/drifts/:driftId/dismiss', requireTeamLead, dismissDrift);
driftRouter.put('/:id/drifts/:driftId/reopen', requireTeamLead, reopenDrift);

// Bulk actions
driftRouter.post('/:id/drifts/bulk-accept', requireTeamLead, bulkAccept);
driftRouter.post('/:id/drifts/bulk-dismiss', requireTeamLead, bulkDismiss);

export { driftRouter };
export default driftRouter;
