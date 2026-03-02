// --- Sync policy types ---

export type FieldDriftPolicy = 'flag' | 'manifest_wins' | 'local_wins';
export type RemovalPolicy = 'flag' | 'deactivate' | 'delete';
export type MetadataRemovalPolicy = 'remove' | 'keep';

export interface ManifestSyncPolicy {
  on_field_drift: FieldDriftPolicy;
  on_removal: RemovalPolicy;
  on_alias_removal: MetadataRemovalPolicy;
  on_override_removal: MetadataRemovalPolicy;
  on_association_removal: MetadataRemovalPolicy;
}

// --- Manifest config types ---

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

export interface ManifestConfigInput {
  manifest_url: string;
  is_enabled?: boolean;
  sync_policy?: Partial<ManifestSyncPolicy>;
}

// --- Sync result types ---

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

export interface ManifestSyncChange {
  manifest_key: string;
  service_name: string;
  action: 'created' | 'updated' | 'deactivated' | 'deleted' | 'drift_flagged' | 'unchanged';
  fields_changed?: string[];
  drift_fields?: string[];
}

export interface ManifestSyncResult {
  status: 'success' | 'partial' | 'failed';
  summary: ManifestSyncSummary;
  errors: string[];
  warnings: string[];
  changes: ManifestSyncChange[];
  duration_ms: number;
}

// --- Sync history types ---

export interface ManifestSyncHistoryEntry {
  id: string;
  team_id: string;
  trigger_type: 'manual' | 'scheduled';
  triggered_by: string | null;
  manifest_url: string;
  status: string;
  summary: string | null; // JSON string of ManifestSyncSummary
  errors: string | null; // JSON string of string[]
  warnings: string | null; // JSON string of string[]
  duration_ms: number | null;
  created_at: string;
}

// --- Validation types ---

export type ManifestValidationSeverity = 'error' | 'warning';

export interface ManifestValidationIssue {
  severity: ManifestValidationSeverity;
  path: string;
  message: string;
}

export interface ManifestValidationResult {
  valid: boolean;
  version: number | null;
  service_count: number;
  valid_count: number;
  errors: ManifestValidationIssue[];
  warnings: ManifestValidationIssue[];
}

// --- Test URL result types ---

export interface ManifestTestUrlResult {
  fetch_success: boolean;
  fetch_error: string | null;
  validation: ManifestValidationResult | null;
}

// --- Drift flag types ---

export type DriftType = 'field_change' | 'service_removal';
export type DriftFlagStatus = 'pending' | 'dismissed' | 'accepted' | 'resolved';

export interface DriftFlagWithContext {
  id: string;
  team_id: string;
  service_id: string;
  drift_type: DriftType;
  field_name: string | null;
  manifest_value: string | null;
  current_value: string | null;
  status: DriftFlagStatus;
  first_detected_at: string;
  last_detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  sync_history_id: string | null;
  created_at: string;
  service_name: string;
  manifest_key: string | null;
  resolved_by_name: string | null;
}

export interface DriftSummary {
  pending_count: number;
  dismissed_count: number;
  field_change_pending: number;
  service_removal_pending: number;
}

export interface BulkDriftActionResult {
  succeeded: number;
  failed: number;
  errors: Array<{ flag_id: string; error: string }>;
}

// --- API response types ---

export interface DriftFlagsResponse {
  flags: DriftFlagWithContext[];
  summary: DriftSummary;
  total: number;
}

export interface SyncHistoryResponse {
  history: ManifestSyncHistoryEntry[];
  total: number;
}

export interface DriftFlagListOptions {
  status?: DriftFlagStatus;
  drift_type?: DriftType;
  service_id?: string;
  limit?: number;
  offset?: number;
}

export interface SyncHistoryListOptions {
  limit?: number;
  offset?: number;
}
