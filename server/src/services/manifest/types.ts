import { AssociationType } from '../../db/types';

// --- DPS-49a: Sync policy types ---

/** Policy for how to handle field-level drift between manifest and local values. */
export type FieldDriftPolicy = 'flag' | 'manifest_wins' | 'local_wins';

/** Policy for how to handle services removed from the manifest. */
export type RemovalPolicy = 'flag' | 'deactivate' | 'delete';

/** Policy for how to handle removal of metadata entries (aliases, overrides, associations). */
export type MetadataRemovalPolicy = 'remove' | 'keep';

/** Sync policy controlling how the sync engine handles conflicts and removals. */
export interface ManifestSyncPolicy {
  on_field_drift: FieldDriftPolicy;
  on_removal: RemovalPolicy;
  on_alias_removal: MetadataRemovalPolicy;
  on_override_removal: MetadataRemovalPolicy;
  on_association_removal: MetadataRemovalPolicy;
}

/** Default sync policy — flag drift and removals, keep metadata. */
export const DEFAULT_SYNC_POLICY: ManifestSyncPolicy = {
  on_field_drift: 'flag',
  on_removal: 'flag',
  on_alias_removal: 'keep',
  on_override_removal: 'keep',
  on_association_removal: 'keep',
};

// --- DPS-49b: Manifest config types ---

/** DB row type for team_manifest_config table. */
export interface TeamManifestConfig {
  id: string;
  team_id: string;
  manifest_url: string;
  is_enabled: number; // SQLite boolean
  sync_policy: string | null; // JSON string of ManifestSyncPolicy
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  last_sync_summary: string | null; // JSON string of ManifestSyncSummary
  created_at: string;
  updated_at: string;
}

/** Input for creating a new manifest config. */
export interface ManifestConfigCreateInput {
  team_id: string;
  manifest_url: string;
  is_enabled?: boolean;
  sync_policy?: ManifestSyncPolicy;
}

/** Input for updating an existing manifest config. */
export interface ManifestConfigUpdateInput {
  manifest_url?: string;
  is_enabled?: boolean;
  sync_policy?: Partial<ManifestSyncPolicy>;
}

// --- DPS-49c: Parsed manifest entry types ---

/** A service entry in the manifest JSON. */
export interface ManifestServiceEntry {
  key: string;
  name: string;
  health_endpoint: string;
  description?: string;
  metrics_endpoint?: string;
  poll_interval_ms?: number;
  schema_config?: Record<string, unknown>;
}

/** An alias entry in the manifest JSON. */
export interface ManifestAliasEntry {
  alias: string;
  canonical_name: string;
}

/** A canonical override entry in the manifest JSON. */
export interface ManifestCanonicalOverrideEntry {
  canonical_name: string;
  contact?: Record<string, unknown>;
  impact?: string;
}

/** An association entry in the manifest JSON. */
export interface ManifestAssociationEntry {
  service_key: string;
  dependency_name: string;
  linked_service_key: string;
  association_type: AssociationType;
}

/** Parsed and structured manifest JSON. */
export interface ParsedManifest {
  version: number;
  services: ManifestServiceEntry[];
  aliases?: ManifestAliasEntry[];
  canonical_overrides?: ManifestCanonicalOverrideEntry[];
  associations?: ManifestAssociationEntry[];
}

// --- DPS-49d: Validation types ---

/** Severity level of a validation issue. */
export type ManifestValidationSeverity = 'error' | 'warning';

/** A single validation issue found during manifest validation. */
export interface ManifestValidationIssue {
  severity: ManifestValidationSeverity;
  path: string;
  message: string;
}

/** Result of validating a manifest. */
export interface ManifestValidationResult {
  valid: boolean;
  version: number | null;
  service_count: number;
  valid_count: number;
  errors: ManifestValidationIssue[];
  warnings: ManifestValidationIssue[];
}

// --- DPS-49e: Sync result types ---

/** Summary counters for a sync execution. */
export interface ManifestSyncSummary {
  services: {
    created: number;
    updated: number;
    deactivated: number;
    deleted: number;
    drift_flagged: number;
    unchanged: number;
  };
  aliases: {
    created: number;
    updated: number;
    removed: number;
    unchanged: number;
  };
  overrides: {
    created: number;
    updated: number;
    removed: number;
    unchanged: number;
  };
  associations: {
    created: number;
    removed: number;
    unchanged: number;
  };
}

/** Detail of a change applied to a single service during sync. */
export interface ManifestSyncChange {
  manifest_key: string;
  service_name: string;
  action: 'created' | 'updated' | 'deactivated' | 'deleted' | 'drift_flagged' | 'unchanged';
  fields_changed?: string[];
  drift_fields?: string[];
}

/** Overall result of a sync execution. */
export interface ManifestSyncResult {
  status: 'success' | 'partial' | 'failed';
  summary: ManifestSyncSummary;
  errors: string[];
  warnings: string[];
  changes: ManifestSyncChange[];
  duration_ms: number;
}

// --- DPS-49f: Diff types ---

/** An entry scheduled for update (no drift — safe to apply). */
export interface ManifestUpdateEntry {
  manifest_entry: ManifestServiceEntry;
  existing_service_id: string;
  fields_changed: string[];
}

/** An entry where manual edits were detected — requires drift policy resolution. */
export interface ManifestDriftEntry {
  manifest_entry: ManifestServiceEntry;
  existing_service_id: string;
  field_name: string;
  manifest_value: string;
  current_value: string;
}

/** Result of diffing the manifest against the current DB state. */
export interface ManifestDiffResult {
  toCreate: ManifestServiceEntry[];
  toUpdate: ManifestUpdateEntry[];
  toDrift: ManifestDriftEntry[];
  toKeepLocal: ManifestDriftEntry[];
  unchanged: string[]; // service IDs
  toDeactivate: string[]; // service IDs (on_removal = 'deactivate')
  toDelete: string[]; // service IDs (on_removal = 'delete')
  removalDrift: string[]; // service IDs (on_removal = 'flag')
}

// --- DPS-49g: Sync history and fetch types ---

/** DB row type for manifest_sync_history table. */
export interface ManifestSyncHistoryEntry {
  id: string;
  team_id: string;
  trigger_type: 'manual' | 'scheduled';
  triggered_by: string | null; // FK → users.id, NULL for scheduled
  manifest_url: string;
  status: string;
  summary: string | null; // JSON string of ManifestSyncSummary
  errors: string | null; // JSON string of string[]
  warnings: string | null; // JSON string of string[]
  duration_ms: number | null;
  created_at: string;
}

/** Result of fetching a manifest URL — discriminated union. */
export type ManifestFetchResult =
  | { success: true; data: unknown; url: string }
  | { success: false; error: string; url: string };
