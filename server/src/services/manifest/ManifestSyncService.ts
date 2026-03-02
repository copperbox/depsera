import { EventEmitter } from 'events';
import { getStores, StoreRegistry, withTransaction } from '../../stores';
import type { Service } from '../../db/types';
import { HealthPollingService } from '../polling/HealthPollingService';
import { fetchManifest } from './ManifestFetcher';
import { validateManifest } from './ManifestValidator';
import { diffManifest } from './ManifestDiffer';
import { logAuditEvent } from '../audit/AuditLogService';
import { validateUrlNotPrivate } from '../../utils/ssrf';
import logger from '../../utils/logger';
import {
  ManifestSyncPolicy,
  ManifestSyncResult,
  ManifestSyncSummary,
  ManifestSyncChange,
  ManifestDiffResult,
  ManifestServiceEntry,
  DEFAULT_SYNC_POLICY,
  ParsedManifest,
  TeamManifestConfig,
} from './types';

// --- Constants ---

const SCHEDULE_CHECK_INTERVAL_MS = 60_000; // Check every 60s
const DEFAULT_SYNC_INTERVAL_MS = 3_600_000; // 1 hour
const STALE_LOCK_TIMEOUT_MS = 5 * 60_000; // 5 minutes
const MANUAL_SYNC_COOLDOWN_MS = 60_000; // 60 seconds
const SHUTDOWN_WAIT_MS = 30_000; // 30 seconds
const SHUTDOWN_CHECK_INTERVAL_MS = 100; // 100ms

// --- Event Types ---

export enum ManifestSyncEventType {
  SYNC_COMPLETE = 'sync_complete',
  SYNC_ERROR = 'sync_error',
  DRIFT_DETECTED = 'drift_detected',
}

export interface SyncCompleteEvent {
  teamId: string;
  result: ManifestSyncResult;
}

export interface SyncErrorEvent {
  teamId: string;
  error: string;
}

export interface DriftDetectedEvent {
  teamId: string;
  driftCount: number;
}

// --- Lock ---

interface SyncLock {
  acquiredAt: number;
}

// --- Service ---

export class ManifestSyncService extends EventEmitter {
  private static instance: ManifestSyncService | null = null;

  private locks: Map<string, SyncLock> = new Map();
  private lastManualSync: Map<string, number> = new Map();
  private scheduleTimer: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;
  private activeSyncs = 0;
  private stores: StoreRegistry;

  private constructor(stores?: StoreRegistry) {
    super();
    this.stores = stores || getStores();
  }

  static getInstance(): ManifestSyncService {
    if (!ManifestSyncService.instance) {
      ManifestSyncService.instance = new ManifestSyncService();
    }
    return ManifestSyncService.instance;
  }

  static resetInstance(): void {
    if (ManifestSyncService.instance) {
      ManifestSyncService.instance.shutdown();
      ManifestSyncService.instance = null;
    }
  }

  /** For testing — create with injected stores. */
  static createForTesting(stores: StoreRegistry): ManifestSyncService {
    return new ManifestSyncService(stores);
  }

  // --- Scheduling ---

  /**
   * Start the scheduled sync checker.
   * Checks every 60s whether any enabled teams are due for a sync.
   */
  start(): void {
    const enabled = process.env.MANIFEST_SYNC_ENABLED;
    if (enabled === 'false' || enabled === '0') {
      logger.info('[ManifestSync] Scheduled sync disabled via MANIFEST_SYNC_ENABLED');
      return;
    }

    if (this.scheduleTimer) return;

    logger.info('[ManifestSync] Starting scheduled sync checker');
    this.scheduleTimer = setInterval(() => {
      this.checkSchedule();
    }, SCHEDULE_CHECK_INTERVAL_MS);
    this.scheduleTimer.unref();
  }

  /**
   * Check all enabled configs and sync any that are overdue.
   */
  private async checkSchedule(): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      const configs = this.stores.manifestConfig.findAllEnabled();
      const syncInterval = this.getSyncIntervalMs();
      const now = Date.now();

      for (const config of configs) {
        if (this.isShuttingDown) break;

        const lastSync = config.last_sync_at ? new Date(config.last_sync_at).getTime() : 0;
        if (now - lastSync >= syncInterval) {
          await this.syncTeam(config.team_id, 'scheduled', null);
        }
      }
    } catch (error) {
      logger.error({ err: error }, '[ManifestSync] Schedule check failed');
    }
  }

  private getSyncIntervalMs(): number {
    const envVal = process.env.MANIFEST_SYNC_INTERVAL_MS;
    if (envVal) {
      const parsed = parseInt(envVal, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return DEFAULT_SYNC_INTERVAL_MS;
  }

  // --- Concurrency ---

  /**
   * Check whether a manual sync is allowed (60s cooldown per team).
   */
  canManualSync(teamId: string): { allowed: boolean; retryAfterMs?: number } {
    const lastSync = this.lastManualSync.get(teamId);
    if (!lastSync) return { allowed: true };

    const elapsed = Date.now() - lastSync;
    if (elapsed >= MANUAL_SYNC_COOLDOWN_MS) return { allowed: true };

    return { allowed: false, retryAfterMs: MANUAL_SYNC_COOLDOWN_MS - elapsed };
  }

  /**
   * Check if a sync is currently in progress for this team.
   */
  isSyncing(teamId: string): boolean {
    const lock = this.locks.get(teamId);
    if (!lock) return false;

    // Check for stale lock
    if (Date.now() - lock.acquiredAt > STALE_LOCK_TIMEOUT_MS) {
      this.locks.delete(teamId);
      return false;
    }

    return true;
  }

  private acquireLock(teamId: string): boolean {
    if (this.isSyncing(teamId)) return false;
    this.locks.set(teamId, { acquiredAt: Date.now() });
    return true;
  }

  private releaseLock(teamId: string): void {
    this.locks.delete(teamId);
  }

  // --- Core Sync Flow ---

  /**
   * Sync a team's services against their manifest.
   *
   * @param teamId - The team to sync
   * @param triggerType - 'manual' or 'scheduled'
   * @param triggeredBy - User ID for manual syncs, null for scheduled
   * @returns ManifestSyncResult
   */
  async syncTeam(
    teamId: string,
    triggerType: 'manual' | 'scheduled',
    triggeredBy: string | null,
  ): Promise<ManifestSyncResult> {
    const startTime = Date.now();

    // Load config
    const config = this.stores.manifestConfig.findByTeamId(teamId);
    if (!config) {
      return this.failResult('Manifest config not found', startTime);
    }
    if (!config.is_enabled) {
      return this.failResult('Manifest sync is disabled for this team', startTime);
    }

    // Acquire lock
    if (!this.acquireLock(teamId)) {
      return this.failResult('Sync already in progress for this team', startTime);
    }

    this.activeSyncs++;

    if (triggerType === 'manual') {
      this.lastManualSync.set(teamId, Date.now());
    }

    try {
      const result = await this.executeSyncPipeline(teamId, config, triggerType, triggeredBy, startTime);

      // Record history and update config
      this.recordSyncCompletion(teamId, config, result, triggerType, triggeredBy);

      // Emit events
      this.emit(ManifestSyncEventType.SYNC_COMPLETE, {
        teamId,
        result,
      } as SyncCompleteEvent);

      if (result.summary.services.drift_flagged > 0) {
        this.emit(ManifestSyncEventType.DRIFT_DETECTED, {
          teamId,
          driftCount: result.summary.services.drift_flagged,
        } as DriftDetectedEvent);
      }

      // Audit log
      this.logSyncAudit(teamId, triggerType, triggeredBy, result);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, teamId }, '[ManifestSync] Sync failed');

      const failResult = this.failResult(errorMessage, startTime);

      // Record failure
      this.recordSyncCompletion(teamId, config, failResult, triggerType, triggeredBy);

      this.emit(ManifestSyncEventType.SYNC_ERROR, {
        teamId,
        error: errorMessage,
      } as SyncErrorEvent);

      return failResult;
    } finally {
      this.releaseLock(teamId);
      this.activeSyncs--;
    }
  }

  private async executeSyncPipeline(
    teamId: string,
    config: TeamManifestConfig,
    triggerType: 'manual' | 'scheduled',
    triggeredBy: string | null,
    startTime: number,
  ): Promise<ManifestSyncResult> {
    const policy = this.parseSyncPolicy(config.sync_policy);
    const errors: string[] = [];
    const warnings: string[] = [];

    // Step 1: Fetch manifest
    const fetchResult = await fetchManifest(config.manifest_url);
    if (!fetchResult.success) {
      return this.failResult(fetchResult.error, startTime);
    }

    // Step 2: Validate manifest
    const validationResult = validateManifest(fetchResult.data);
    if (!validationResult.valid) {
      const validationErrors = validationResult.errors.map(e => `${e.path}: ${e.message}`);
      return {
        status: 'failed',
        summary: this.emptySummary(),
        errors: validationErrors,
        warnings: validationResult.warnings.map(w => `${w.path}: ${w.message}`),
        changes: [],
        duration_ms: Date.now() - startTime,
      };
    }

    // Collect validation warnings
    warnings.push(...validationResult.warnings.map(w => `${w.path}: ${w.message}`));

    const manifest = fetchResult.data as ParsedManifest;
    const validServices = manifest.services.filter((_s, i) => {
      // Only include services that passed individual validation
      // Since the manifest is valid, all services passed
      return true;
    });

    // Step 3: Async SSRF validation on service endpoints
    const ssrfResults = await Promise.allSettled(
      validServices.map(async (svc) => {
        try {
          await validateUrlNotPrivate(svc.health_endpoint);
          return { key: svc.key, safe: true };
        } catch {
          return { key: svc.key, safe: false };
        }
      }),
    );

    const ssrfSafe = new Set<string>();
    for (const result of ssrfResults) {
      if (result.status === 'fulfilled' && result.value.safe) {
        ssrfSafe.add(result.value.key);
      } else if (result.status === 'fulfilled' && !result.value.safe) {
        warnings.push(`Service "${result.value.key}": health_endpoint targets a private address`);
      }
    }

    // Filter to only SSRF-safe services for creation (existing services keep their endpoints)
    const safeServices = validServices;

    // Step 4: Load existing manifest-managed services for this team
    const existingServices = this.stores.services
      .findByTeamId(teamId)
      .filter((s: Service) => s.manifest_managed === 1);

    // Step 5: Diff
    const diff = diffManifest(safeServices, existingServices, policy);

    // Step 6: Apply changes in transaction
    let applyResult: { summary: ManifestSyncSummary; changes: ManifestSyncChange[] };
    try {
      applyResult = this.applyChanges(
        teamId,
        diff,
        safeServices,
        policy,
        triggerType,
        triggeredBy,
        config.manifest_url,
        ssrfSafe,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('FOREIGN KEY constraint')) {
        return this.failResult(
          `Service sync failed due to a missing reference — verify that team "${teamId}" still exists and has not been deleted`,
          startTime,
        );
      }
      throw error;
    }
    const { summary, changes } = applyResult;

    // Step 7: Sync metadata (aliases, overrides, associations)
    this.syncAliases(teamId, manifest, policy, summary, errors);
    this.syncCanonicalOverrides(teamId, manifest, policy, summary, triggeredBy, errors);
    this.syncAssociations(teamId, manifest, existingServices, policy, summary, errors);

    // Step 8: Polling integration (outside transaction)
    this.updatePolling(diff, changes);

    const durationMs = Date.now() - startTime;

    return {
      status: errors.length > 0 ? 'partial' : 'success',
      summary,
      errors,
      warnings,
      changes,
      duration_ms: durationMs,
    };
  }

  // --- Apply Changes ---

  private applyChanges(
    teamId: string,
    diff: ManifestDiffResult,
    manifestEntries: ManifestServiceEntry[],
    policy: ManifestSyncPolicy,
    triggerType: 'manual' | 'scheduled',
    triggeredBy: string | null,
    manifestUrl: string,
    ssrfSafe: Set<string>,
  ): { summary: ManifestSyncSummary; changes: ManifestSyncChange[] } {
    const summary = this.emptySummary();
    const changes: ManifestSyncChange[] = [];

    withTransaction((txStores) => {
      // Create new services
      for (const entry of diff.toCreate) {
        if (!ssrfSafe.has(entry.key)) {
          // Skip services with SSRF-blocked endpoints (don't create)
          continue;
        }

        const service = txStores.services.create({
          name: entry.name,
          team_id: teamId,
          health_endpoint: entry.health_endpoint,
          metrics_endpoint: entry.metrics_endpoint ?? null,
          schema_config: entry.schema_config ? JSON.stringify(entry.schema_config) : null,
          poll_interval_ms: entry.poll_interval_ms ?? 30000,
          description: entry.description ?? null,
        });

        // Set manifest columns via raw update (not in ServiceUpdateInput)
        this.setManifestColumns(txStores, service.id, entry);

        summary.services.created++;
        changes.push({
          manifest_key: entry.key,
          service_name: entry.name,
          action: 'created',
        });
      }

      // Update changed services (safe fields)
      for (const updateEntry of diff.toUpdate) {
        const updateInput: Record<string, unknown> = {};
        for (const field of updateEntry.fields_changed) {
          const value = this.getManifestFieldForUpdate(updateEntry.manifest_entry, field);
          if (value !== undefined) {
            updateInput[field] = value;
          }
        }

        if (Object.keys(updateInput).length > 0) {
          txStores.services.update(updateEntry.existing_service_id, updateInput as any);
        }

        // Update manifest_last_synced_values snapshot
        this.updateSyncedValues(txStores, updateEntry.existing_service_id, updateEntry.manifest_entry);

        summary.services.updated++;
        changes.push({
          manifest_key: updateEntry.manifest_entry.key,
          service_name: updateEntry.manifest_entry.name,
          action: 'updated',
          fields_changed: updateEntry.fields_changed,
        });
      }

      // Upsert drift flags for drifted fields
      for (const driftEntry of diff.toDrift) {
        txStores.driftFlags.upsertFieldDrift(
          driftEntry.existing_service_id,
          driftEntry.field_name,
          driftEntry.manifest_value,
          driftEntry.current_value,
          null,
        );

        summary.services.drift_flagged++;
        changes.push({
          manifest_key: driftEntry.manifest_entry.key,
          service_name: driftEntry.manifest_entry.name,
          action: 'drift_flagged',
          drift_fields: [driftEntry.field_name],
        });
      }

      // Handle removals
      for (const serviceId of diff.toDeactivate) {
        const svc = txStores.services.findById(serviceId);
        txStores.services.update(serviceId, { is_active: false });
        // Resolve any pending drift flags for this service
        txStores.driftFlags.resolveAllForService(serviceId);
        summary.services.deactivated++;

        changes.push({
          manifest_key: svc?.manifest_key ?? 'unknown',
          service_name: svc?.name ?? 'unknown',
          action: 'deactivated',
        });
      }

      for (const serviceId of diff.toDelete) {
        // Resolve drift flags before deleting
        txStores.driftFlags.resolveAllForService(serviceId);

        const svc = txStores.services.findById(serviceId);
        txStores.services.delete(serviceId);
        summary.services.deleted++;

        changes.push({
          manifest_key: svc?.manifest_key ?? 'unknown',
          service_name: svc?.name ?? 'unknown',
          action: 'deleted',
        });
      }

      // Upsert removal drift flags
      for (const serviceId of diff.removalDrift) {
        txStores.driftFlags.upsertRemovalDrift(serviceId, null);

        const svc = txStores.services.findById(serviceId);
        summary.services.drift_flagged++;
        changes.push({
          manifest_key: svc?.manifest_key ?? 'unknown',
          service_name: svc?.name ?? 'unknown',
          action: 'drift_flagged',
        });
      }

      // Unchanged
      summary.services.unchanged = diff.unchanged.length;
      for (const serviceId of diff.unchanged) {
        const svc = txStores.services.findById(serviceId);
        if (svc) {
          changes.push({
            manifest_key: svc.manifest_key ?? 'unknown',
            service_name: svc.name,
            action: 'unchanged',
          });
        }
      }

      // Auto-resolve stale drift flags:
      // If a service that previously had field_change drift is now matched and unchanged
      // or updated, resolve those old drift flags
      const matchedServiceIds = new Set([
        ...diff.toUpdate.map(u => u.existing_service_id),
        ...diff.unchanged,
      ]);
      for (const serviceId of matchedServiceIds) {
        // Find active field_change drifts that are now resolved
        const activeDrifts = txStores.driftFlags.findActiveByServiceId(serviceId);
        for (const drift of activeDrifts) {
          if (drift.drift_type === 'service_removal') {
            // Service is back in manifest — auto-resolve removal drift
            txStores.driftFlags.resolve(drift.id, 'resolved', null);
          }
        }
      }
    });

    return { summary, changes };
  }

  /** Set manifest_key, manifest_managed, manifest_last_synced_values on a service. */
  private setManifestColumns(
    txStores: StoreRegistry,
    serviceId: string,
    entry: ManifestServiceEntry,
  ): void {
    // Use the raw db from the store registry to set manifest-specific columns
    // that aren't in ServiceUpdateInput
    const db = (txStores.services as any).db;
    const syncedValues = this.buildSyncedValues(entry);
    db.prepare(`
      UPDATE services
      SET manifest_key = ?, manifest_managed = 1, manifest_last_synced_values = ?, updated_at = ?
      WHERE id = ?
    `).run(entry.key, JSON.stringify(syncedValues), new Date().toISOString(), serviceId);
  }

  /** Update manifest_last_synced_values snapshot after updating a service. */
  private updateSyncedValues(
    txStores: StoreRegistry,
    serviceId: string,
    entry: ManifestServiceEntry,
  ): void {
    const db = (txStores.services as any).db;
    const syncedValues = this.buildSyncedValues(entry);
    db.prepare(`
      UPDATE services SET manifest_last_synced_values = ? WHERE id = ?
    `).run(JSON.stringify(syncedValues), serviceId);
  }

  /** Build the manifest_last_synced_values snapshot from a manifest entry. */
  private buildSyncedValues(entry: ManifestServiceEntry): Record<string, unknown> {
    const values: Record<string, unknown> = {
      name: entry.name,
      health_endpoint: entry.health_endpoint,
    };
    if (entry.description !== undefined) values.description = entry.description;
    if (entry.metrics_endpoint !== undefined) values.metrics_endpoint = entry.metrics_endpoint;
    if (entry.poll_interval_ms !== undefined) values.poll_interval_ms = entry.poll_interval_ms;
    if (entry.schema_config !== undefined) values.schema_config = entry.schema_config;
    return values;
  }

  /** Get a manifest field value formatted for ServiceUpdateInput. */
  private getManifestFieldForUpdate(
    entry: ManifestServiceEntry,
    field: string,
  ): unknown {
    switch (field) {
      case 'name': return entry.name;
      case 'health_endpoint': return entry.health_endpoint;
      case 'description': return entry.description ?? null;
      case 'metrics_endpoint': return entry.metrics_endpoint ?? null;
      case 'poll_interval_ms': return entry.poll_interval_ms;
      case 'schema_config':
        return entry.schema_config ? JSON.stringify(entry.schema_config) : null;
      default: return undefined;
    }
  }

  // --- Metadata Sync ---

  /** Sync aliases from the manifest. */
  private syncAliases(
    teamId: string,
    manifest: ParsedManifest,
    policy: ManifestSyncPolicy,
    summary: ManifestSyncSummary,
    errors: string[],
  ): void {
    if (!manifest.aliases || manifest.aliases.length === 0) {
      // If policy says remove and there are no aliases, remove team-scoped aliases
      if (policy.on_alias_removal === 'remove') {
        this.removeTeamAliases(teamId, summary);
      }
      return;
    }

    const manifestAliases = new Map(manifest.aliases.map(a => [a.alias, a.canonical_name]));
    const existingAliases = this.stores.aliases.findAll()
      .filter(a => a.manifest_team_id === teamId);

    const existingByAlias = new Map(existingAliases.map(a => [a.alias, a]));

    // Create or update aliases from manifest
    for (const [alias, canonicalName] of manifestAliases) {
      const existing = existingByAlias.get(alias);
      if (!existing) {
        try {
          this.createTeamAlias(teamId, alias, canonicalName);
          summary.aliases.created++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('UNIQUE constraint')) {
            errors.push(`Alias "${alias}" (→ ${canonicalName}) conflicts with an existing alias — each alias must be unique across all teams`);
          } else if (msg.includes('FOREIGN KEY constraint')) {
            errors.push(`Alias "${alias}" (→ ${canonicalName}) failed — the owning team no longer exists (team may have been deleted)`);
          } else {
            errors.push(`Failed to create alias "${alias}" (→ ${canonicalName}): ${msg}`);
          }
        }
      } else if (existing.canonical_name !== canonicalName) {
        try {
          this.stores.aliases.update(existing.id, canonicalName);
          summary.aliases.updated++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('FOREIGN KEY constraint')) {
            errors.push(`Alias "${alias}" update failed — the owning team no longer exists (team may have been deleted)`);
          } else {
            errors.push(`Failed to update alias "${alias}" (→ ${canonicalName}): ${msg}`);
          }
        }
      } else {
        summary.aliases.unchanged++;
      }
    }

    // Handle aliases no longer in manifest
    for (const existing of existingAliases) {
      if (!manifestAliases.has(existing.alias)) {
        if (policy.on_alias_removal === 'remove') {
          this.stores.aliases.delete(existing.id);
          summary.aliases.removed++;
        } else {
          summary.aliases.unchanged++;
        }
      }
    }
  }

  /** Create a team-scoped alias. */
  private createTeamAlias(teamId: string, alias: string, canonicalName: string): void {
    // Use raw DB to set manifest_team_id (not in the base create interface)
    const db = (this.stores.aliases as any).db;
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO dependency_aliases (id, alias, canonical_name, manifest_team_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, alias, canonicalName, teamId, new Date().toISOString());
  }

  /** Remove all team-scoped aliases. */
  private removeTeamAliases(teamId: string, summary: ManifestSyncSummary): void {
    const existing = this.stores.aliases.findAll()
      .filter(a => a.manifest_team_id === teamId);

    for (const alias of existing) {
      this.stores.aliases.delete(alias.id);
      summary.aliases.removed++;
    }
  }

  /** Sync canonical overrides from the manifest. */
  private syncCanonicalOverrides(
    teamId: string,
    manifest: ParsedManifest,
    policy: ManifestSyncPolicy,
    summary: ManifestSyncSummary,
    triggeredBy: string | null,
    errors: string[],
  ): void {
    if (!manifest.canonical_overrides || manifest.canonical_overrides.length === 0) {
      if (policy.on_override_removal === 'remove') {
        this.removeTeamOverrides(teamId, summary);
      }
      return;
    }

    const manifestOverrides = new Map(
      manifest.canonical_overrides.map(o => [o.canonical_name, o]),
    );

    const existingOverrides = this.stores.canonicalOverrides.findAll(teamId)
      .filter(o => o.team_id === teamId && o.manifest_managed === 1);

    const existingByName = new Map(existingOverrides.map(o => [o.canonical_name, o]));

    // Create or update overrides from manifest
    for (const [canonicalName, override] of manifestOverrides) {
      const existing = existingByName.get(canonicalName);
      const contactStr = override.contact ? JSON.stringify(override.contact) : null;
      const impactStr = override.impact ?? null;

      if (!existing) {
        try {
          this.stores.canonicalOverrides.upsert({
            canonical_name: canonicalName,
            team_id: teamId,
            contact_override: contactStr,
            impact_override: impactStr,
            manifest_managed: 1,
            updated_by: triggeredBy ?? 'system',
          });
          summary.overrides.created++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('FOREIGN KEY constraint')) {
            errors.push(`Override "${canonicalName}" failed — the referenced team or user no longer exists (triggered_by: ${triggeredBy ?? 'scheduled sync'})`);
          } else {
            errors.push(`Failed to create override for "${canonicalName}": ${msg}`);
          }
        }
      } else if (
        existing.contact_override !== contactStr ||
        existing.impact_override !== impactStr
      ) {
        try {
          this.stores.canonicalOverrides.upsert({
            canonical_name: canonicalName,
            team_id: teamId,
            contact_override: contactStr,
            impact_override: impactStr,
            manifest_managed: 1,
            updated_by: triggeredBy ?? 'system',
          });
          summary.overrides.updated++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('FOREIGN KEY constraint')) {
            errors.push(`Override "${canonicalName}" update failed — the referenced team or user no longer exists (triggered_by: ${triggeredBy ?? 'scheduled sync'})`);
          } else {
            errors.push(`Failed to update override for "${canonicalName}": ${msg}`);
          }
        }
      } else {
        summary.overrides.unchanged++;
      }
    }

    // Handle overrides no longer in manifest
    for (const existing of existingOverrides) {
      if (!manifestOverrides.has(existing.canonical_name)) {
        if (policy.on_override_removal === 'remove') {
          this.stores.canonicalOverrides.deleteByTeam(existing.canonical_name, teamId);
          summary.overrides.removed++;
        } else {
          summary.overrides.unchanged++;
        }
      }
    }
  }

  /** Remove all team-scoped manifest-managed overrides. */
  private removeTeamOverrides(teamId: string, summary: ManifestSyncSummary): void {
    const existing = this.stores.canonicalOverrides.findAll(teamId)
      .filter(o => o.team_id === teamId && o.manifest_managed === 1);

    for (const override of existing) {
      this.stores.canonicalOverrides.deleteByTeam(override.canonical_name, teamId);
      summary.overrides.removed++;
    }
  }

  /** Sync associations from the manifest. */
  private syncAssociations(
    teamId: string,
    manifest: ParsedManifest,
    existingServices: Service[],
    policy: ManifestSyncPolicy,
    summary: ManifestSyncSummary,
    errors: string[],
  ): void {
    if (!manifest.associations || manifest.associations.length === 0) {
      if (policy.on_association_removal === 'remove') {
        this.removeTeamAssociations(teamId, summary);
      }
      return;
    }

    // Build service lookup by manifest_key — include newly created services
    const allTeamServices = this.stores.services.findByTeamId(teamId);
    const serviceByKey = new Map(
      allTeamServices
        .filter((s: Service) => s.manifest_key)
        .map((s: Service) => [s.manifest_key!, s]),
    );

    // Build team key lookup: team_id → team_key
    const allTeams = this.stores.teams.findAll();
    const teamKeyById = new Map(
      allTeams
        .filter(t => t.key)
        .map(t => [t.id, t.key!]),
    );

    // Build a cross-team lookup by namespaced key (team_key/manifest_key) for resolving associations
    const allServices = this.stores.services.findAll();
    const globalServiceByKey = new Map(
      allServices
        .filter((s: Service) => s.manifest_key && teamKeyById.get(s.team_id))
        .map((s: Service) => [`${teamKeyById.get(s.team_id)!}/${s.manifest_key!}`, s]),
    );

    // Reverse lookup: service ID → namespaced key (for removal detection)
    const manifestKeyByServiceId = new Map(
      allServices
        .filter((s: Service) => s.manifest_key && teamKeyById.get(s.team_id))
        .map((s: Service) => [s.id, `${teamKeyById.get(s.team_id)!}/${s.manifest_key!}`]),
    );

    // Build a set of manifest association tuples for removal detection
    const manifestTuples = new Set(
      manifest.associations.map(a => `${a.service_key}|${a.dependency_name}|${a.linked_service_key}`),
    );

    // Process manifest associations
    for (const assocEntry of manifest.associations) {
      const service = serviceByKey.get(assocEntry.service_key);
      if (!service) {
        // Service not found — skip
        continue;
      }

      // Find the dependency by name on this service
      const deps = this.stores.dependencies.findByServiceId(service.id);
      const dep = deps.find(d => {
        const resolvedName = d.canonical_name || d.name;
        return resolvedName === assocEntry.dependency_name || d.name === assocEntry.dependency_name;
      });

      if (!dep) {
        // Dependency not found — skip (will appear after first poll)
        continue;
      }

      // Find the linked service by linked_service_key across all teams
      const linkedService = globalServiceByKey.get(assocEntry.linked_service_key);

      if (!linkedService) continue;

      // Check if an association already exists for this (dependency, linked_service) pair
      const existingAssocs = this.stores.associations.findByDependencyId(dep.id);
      const existingForTarget = existingAssocs.find(a => a.linked_service_id === linkedService.id);

      if (existingForTarget) {
        // Adopt existing association as manifest-managed if it isn't already
        if (existingForTarget.manifest_managed !== 1) {
          try {
            const db = (this.stores.associations as any).db;
            db.prepare(`UPDATE dependency_associations SET manifest_managed = 1, association_type = ? WHERE id = ?`)
              .run(assocEntry.association_type, existingForTarget.id);
            summary.associations.created++;
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            errors.push(`Failed to adopt association: service "${assocEntry.service_key}" dependency "${assocEntry.dependency_name}" → "${assocEntry.linked_service_key}": ${msg}`);
          }
        } else {
          summary.associations.unchanged++;
        }
      } else {
        try {
          this.stores.associations.create({
            dependency_id: dep.id,
            linked_service_id: linkedService.id,
            association_type: assocEntry.association_type,
          });

          // Mark as manifest managed via raw DB
          const db = (this.stores.associations as any).db;
          db.prepare(
            `UPDATE dependency_associations SET manifest_managed = 1 WHERE dependency_id = ? AND linked_service_id = ?`,
          ).run(dep.id, linkedService.id);

          summary.associations.created++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('UNIQUE constraint')) {
            errors.push(`Association already exists: service "${assocEntry.service_key}" dependency "${assocEntry.dependency_name}" → "${assocEntry.linked_service_key}"`);
          } else if (msg.includes('FOREIGN KEY constraint')) {
            errors.push(
              `Association "${assocEntry.service_key}" dependency "${assocEntry.dependency_name}" → "${assocEntry.linked_service_key}" ` +
              `failed — the dependency or linked service was removed before the association could be created. ` +
              `Ensure the linked service "${assocEntry.linked_service_key}" exists and the dependency "${assocEntry.dependency_name}" has been discovered by polling`,
            );
          } else {
            errors.push(`Failed to create association: service "${assocEntry.service_key}" dependency "${assocEntry.dependency_name}" → "${assocEntry.linked_service_key}": ${msg}`);
          }
        }
      }
    }

    // Handle associations no longer in manifest (only manifest_managed ones)
    if (policy.on_association_removal === 'remove') {
      // Find all manifest-managed associations for this team's services
      for (const service of allTeamServices) {
        if (!service.manifest_key || service.manifest_managed !== 1) continue;

        const deps = this.stores.dependencies.findByServiceId(service.id);
        for (const dep of deps) {
          const assocs = this.stores.associations.findByDependencyId(dep.id);
          for (const assoc of assocs) {
            if (assoc.manifest_managed !== 1) continue;

            // Check if this association is still in the manifest
            const depName = dep.canonical_name || dep.name;
            const linkedKey = manifestKeyByServiceId.get(assoc.linked_service_id) ?? '';
            const tuple = `${service.manifest_key}|${depName}|${linkedKey}`;
            if (!manifestTuples.has(tuple)) {
              this.stores.associations.delete(assoc.id);
              summary.associations.removed++;
            }
          }
        }
      }
    }
  }

  /** Remove all manifest-managed associations for a team. */
  private removeTeamAssociations(teamId: string, summary: ManifestSyncSummary): void {
    const services = this.stores.services.findByTeamId(teamId)
      .filter((s: Service) => s.manifest_managed === 1);

    for (const service of services) {
      const deps = this.stores.dependencies.findByServiceId(service.id);
      for (const dep of deps) {
        const assocs = this.stores.associations.findByDependencyId(dep.id);
        for (const assoc of assocs) {
          if (assoc.manifest_managed === 1) {
            this.stores.associations.delete(assoc.id);
            summary.associations.removed++;
          }
        }
      }
    }
  }

  // --- Polling Integration ---

  private updatePolling(diff: ManifestDiffResult, changes: ManifestSyncChange[]): void {
    try {
      const pollingService = HealthPollingService.getInstance();

      // Start polling for created services
      for (const entry of diff.toCreate) {
        const wasCreated = changes.some(c => c.manifest_key === entry.key && c.action === 'created');
        if (wasCreated) {
          // Find the newly created service by manifest_key
          const db = (this.stores.services as any).db;
          const svc = db.prepare('SELECT id FROM services WHERE manifest_key = ? ORDER BY created_at DESC LIMIT 1')
            .get(entry.key) as { id: string } | undefined;
          if (svc) {
            pollingService.startService(svc.id);
          }
        }
      }

      // Restart polling for updated services (if endpoint or interval changed)
      for (const updateEntry of diff.toUpdate) {
        const hasEndpointOrIntervalChange = updateEntry.fields_changed.some(
          f => f === 'health_endpoint' || f === 'poll_interval_ms',
        );
        if (hasEndpointOrIntervalChange) {
          pollingService.restartService(updateEntry.existing_service_id);
        }
      }

      // Stop polling for deactivated/deleted services
      for (const serviceId of diff.toDeactivate) {
        pollingService.stopService(serviceId);
      }
      for (const serviceId of diff.toDelete) {
        pollingService.stopService(serviceId);
      }
    } catch (error) {
      logger.warn({ err: error }, '[ManifestSync] Polling integration error (non-fatal)');
    }
  }

  // --- Record Sync Result ---

  private recordSyncCompletion(
    teamId: string,
    config: TeamManifestConfig,
    result: ManifestSyncResult,
    triggerType: 'manual' | 'scheduled',
    triggeredBy: string | null,
  ): void {
    try {
      const now = new Date().toISOString();

      // Update config with sync result
      this.stores.manifestConfig.updateSyncResult(teamId, {
        last_sync_at: now,
        last_sync_status: result.status,
        last_sync_error: result.status === 'failed' ? result.errors.join('; ') : null,
        last_sync_summary: JSON.stringify(result.summary),
      });

      // Create sync history record
      this.stores.manifestSyncHistory.create({
        team_id: teamId,
        trigger_type: triggerType,
        triggered_by: triggeredBy,
        manifest_url: config.manifest_url,
        status: result.status,
        summary: JSON.stringify(result.summary),
        errors: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
        warnings: result.warnings.length > 0 ? JSON.stringify(result.warnings) : null,
        duration_ms: result.duration_ms,
      });
    } catch (error) {
      logger.error({ err: error, teamId }, '[ManifestSync] Failed to record sync result');
    }
  }

  // --- Audit Logging ---

  private logSyncAudit(
    teamId: string,
    triggerType: 'manual' | 'scheduled',
    triggeredBy: string | null,
    result: ManifestSyncResult,
  ): void {
    try {
      logAuditEvent({
        userId: triggeredBy ?? 'system',
        action: 'manifest_sync',
        resourceType: 'team',
        resourceId: teamId,
        details: {
          trigger_type: triggerType,
          status: result.status,
          summary: result.summary,
          duration_ms: result.duration_ms,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, '[ManifestSync] Audit log failed (non-fatal)');
    }
  }

  // --- Graceful Shutdown ---

  async shutdown(): Promise<void> {
    logger.info('[ManifestSync] Shutting down...');
    this.isShuttingDown = true;

    // Stop scheduler
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }

    // Wait for in-progress syncs to complete
    let waited = 0;
    while (this.activeSyncs > 0 && waited < SHUTDOWN_WAIT_MS) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, SHUTDOWN_CHECK_INTERVAL_MS);
        timer.unref();
      });
      waited += SHUTDOWN_CHECK_INTERVAL_MS;
    }

    if (this.activeSyncs > 0) {
      logger.warn(`[ManifestSync] Shutdown timeout — ${this.activeSyncs} syncs still in progress`);
    }

    // Clear state
    this.locks.clear();
    this.lastManualSync.clear();
    this.removeAllListeners();

    logger.info('[ManifestSync] Shutdown complete');
  }

  // --- Helpers ---

  private parseSyncPolicy(raw: string | null): ManifestSyncPolicy {
    if (!raw) return { ...DEFAULT_SYNC_POLICY };
    try {
      const parsed = JSON.parse(raw);
      return {
        on_field_drift: parsed.on_field_drift ?? DEFAULT_SYNC_POLICY.on_field_drift,
        on_removal: parsed.on_removal ?? DEFAULT_SYNC_POLICY.on_removal,
        on_alias_removal: parsed.on_alias_removal ?? DEFAULT_SYNC_POLICY.on_alias_removal,
        on_override_removal: parsed.on_override_removal ?? DEFAULT_SYNC_POLICY.on_override_removal,
        on_association_removal: parsed.on_association_removal ?? DEFAULT_SYNC_POLICY.on_association_removal,
      };
    } catch {
      return { ...DEFAULT_SYNC_POLICY };
    }
  }

  private emptySummary(): ManifestSyncSummary {
    return {
      services: { created: 0, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 0 },
      aliases: { created: 0, updated: 0, removed: 0, unchanged: 0 },
      overrides: { created: 0, updated: 0, removed: 0, unchanged: 0 },
      associations: { created: 0, removed: 0, unchanged: 0 },
    };
  }

  private failResult(error: string, startTime: number): ManifestSyncResult {
    return {
      status: 'failed',
      summary: this.emptySummary(),
      errors: [error],
      warnings: [],
      changes: [],
      duration_ms: Date.now() - startTime,
    };
  }

  /** Visible for testing */
  get activeCount(): number {
    return this.activeSyncs;
  }

  /** Visible for testing */
  get isSchedulerActive(): boolean {
    return this.scheduleTimer !== null;
  }
}
