import { Service } from '../../db/types';
import {
  ManifestServiceEntry,
  ManifestSyncPolicy,
  ManifestDiffResult,
  ManifestUpdateEntry,
  ManifestDriftEntry,
} from './types';

// --- Constants ---

/** Fields that the differ compares between manifest and DB. */
const SYNCABLE_FIELDS = [
  'name',
  'health_endpoint',
  'description',
  'metrics_endpoint',
  'poll_interval_ms',
  'schema_config',
] as const;

type SyncableField = (typeof SYNCABLE_FIELDS)[number];

// --- Public API ---

/**
 * Compute the diff between validated manifest entries and existing services.
 * Pure logic — no DB access. Receives pre-loaded data.
 *
 * @param manifestEntries - Valid service entries from the parsed manifest
 * @param existingServices - Current manifest-managed services from the DB
 * @param policy - The team's sync policy
 * @returns Categorized diff result
 */
export function diffManifest(
  manifestEntries: ManifestServiceEntry[],
  existingServices: Service[],
  policy: ManifestSyncPolicy,
): ManifestDiffResult {
  const result: ManifestDiffResult = {
    toCreate: [],
    toUpdate: [],
    toDrift: [],
    toKeepLocal: [],
    unchanged: [],
    toDeactivate: [],
    toDelete: [],
    removalDrift: [],
  };

  // Build lookup: manifest_key → existing service
  const existingByKey = new Map<string, Service>();
  for (const svc of existingServices) {
    if (svc.manifest_key) {
      existingByKey.set(svc.manifest_key, svc);
    }
  }

  // Track which existing services are matched by manifest entries
  const matchedKeys = new Set<string>();

  // Process each manifest entry
  for (const entry of manifestEntries) {
    const existing = existingByKey.get(entry.key);

    if (!existing) {
      // New service — no match in DB
      result.toCreate.push(entry);
      continue;
    }

    matchedKeys.add(entry.key);
    diffExistingService(entry, existing, policy, result);
  }

  // Process removed services (in DB but not in manifest)
  for (const svc of existingServices) {
    if (svc.manifest_key && !matchedKeys.has(svc.manifest_key)) {
      applyRemovalPolicy(svc.id, policy, result);
    }
  }

  return result;
}

// --- Internal helpers ---

/**
 * Diff an existing service against its manifest entry.
 * Categorizes each field as safe-to-update, drifted, or keep-local.
 */
function diffExistingService(
  entry: ManifestServiceEntry,
  existing: Service,
  policy: ManifestSyncPolicy,
  result: ManifestDiffResult,
): void {
  const lastSynced = parseLastSyncedValues(existing.manifest_last_synced_values);
  const isFirstSync = lastSynced === null;

  const safeFields: string[] = [];
  const driftEntries: ManifestDriftEntry[] = [];
  const keepLocalEntries: ManifestDriftEntry[] = [];

  for (const field of SYNCABLE_FIELDS) {
    const manifestValue = getManifestFieldValue(entry, field);

    // Skip fields not specified in the manifest (undefined → don't sync)
    if (manifestValue === undefined) continue;

    const dbValue = getDbFieldValue(existing, field);
    const manifestStr = normalizeToString(manifestValue);
    const dbStr = normalizeToString(dbValue);

    // No difference — skip
    if (manifestStr === dbStr) continue;

    if (isFirstSync) {
      // First sync: all fields are safe to update (no drift detection)
      safeFields.push(field);
      continue;
    }

    // Check if the DB value was manually edited since last sync
    const lastSyncedStr = normalizeToString(lastSynced[field]);

    if (dbStr === lastSyncedStr) {
      // DB value matches last synced value — not manually edited, safe to update
      safeFields.push(field);
    } else {
      // DB value differs from last synced value — manual edit detected
      const driftEntry: ManifestDriftEntry = {
        manifest_entry: entry,
        existing_service_id: existing.id,
        field_name: field,
        manifest_value: manifestStr,
        current_value: dbStr,
      };

      switch (policy.on_field_drift) {
        case 'flag':
          driftEntries.push(driftEntry);
          break;
        case 'manifest_wins':
          // Overwrite — treat as safe to update
          safeFields.push(field);
          break;
        case 'local_wins':
          keepLocalEntries.push(driftEntry);
          break;
      }
    }
  }

  // Categorize the service based on field results
  if (safeFields.length > 0) {
    result.toUpdate.push({
      manifest_entry: entry,
      existing_service_id: existing.id,
      fields_changed: safeFields,
    });
  }

  if (driftEntries.length > 0) {
    result.toDrift.push(...driftEntries);
  }

  if (keepLocalEntries.length > 0) {
    result.toKeepLocal.push(...keepLocalEntries);
  }

  // If nothing changed at all, it's unchanged
  if (
    safeFields.length === 0 &&
    driftEntries.length === 0 &&
    keepLocalEntries.length === 0
  ) {
    result.unchanged.push(existing.id);
  }
}

/**
 * Apply the removal policy for services in DB but not in manifest.
 */
function applyRemovalPolicy(
  serviceId: string,
  policy: ManifestSyncPolicy,
  result: ManifestDiffResult,
): void {
  switch (policy.on_removal) {
    case 'flag':
      result.removalDrift.push(serviceId);
      break;
    case 'deactivate':
      result.toDeactivate.push(serviceId);
      break;
    case 'delete':
      result.toDelete.push(serviceId);
      break;
  }
}

/**
 * Parse the JSON snapshot of last synced field values.
 * Returns null if the value is null/empty (first sync).
 */
function parseLastSyncedValues(
  raw: string | null,
): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Get the value of a syncable field from a manifest entry.
 * Returns undefined if the field is not present in the manifest.
 */
function getManifestFieldValue(
  entry: ManifestServiceEntry,
  field: SyncableField,
): unknown {
  switch (field) {
    case 'name':
      return entry.name;
    case 'health_endpoint':
      return entry.health_endpoint;
    case 'description':
      return entry.description;
    case 'metrics_endpoint':
      return entry.metrics_endpoint;
    case 'poll_interval_ms':
      return entry.poll_interval_ms;
    case 'schema_config':
      return entry.schema_config;
  }
}

/**
 * Get the value of a syncable field from the DB service row.
 */
function getDbFieldValue(
  service: Service,
  field: SyncableField,
): unknown {
  switch (field) {
    case 'name':
      return service.name;
    case 'health_endpoint':
      return service.health_endpoint;
    case 'description':
      return service.description;
    case 'metrics_endpoint':
      return service.metrics_endpoint;
    case 'poll_interval_ms':
      return service.poll_interval_ms;
    case 'schema_config':
      return service.schema_config;
  }
}

/**
 * Normalize a field value to a string for comparison.
 * - null/undefined → '' (empty string)
 * - objects → JSON.stringify (deterministic for schema_config)
 * - numbers → String()
 * - strings → as-is
 */
function normalizeToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
