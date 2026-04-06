# Store Layer Reference

## StoreRegistry

Central singleton providing access to all stores:

```typescript
class StoreRegistry {
  public readonly services: IServiceStore;
  public readonly teams: ITeamStore;
  public readonly users: IUserStore;
  public readonly dependencies: IDependencyStore;
  public readonly associations: IAssociationStore;
  public readonly latencyHistory: ILatencyHistoryStore;
  public readonly errorHistory: IErrorHistoryStore;
  public readonly aliases: IDependencyAliasStore;
  public readonly auditLog: IAuditLogStore;
  public readonly settings: ISettingsStore;
  public readonly canonicalOverrides: ICanonicalOverrideStore;
  public readonly statusChangeEvents: IStatusChangeEventStore;
  public readonly alertChannels: IAlertChannelStore;
  public readonly alertRules: IAlertRuleStore;
  public readonly alertHistory: IAlertHistoryStore;
  public readonly manifestConfig: IManifestConfigStore;
  public readonly manifestSyncHistory: IManifestSyncHistoryStore;
  public readonly driftFlags: IDriftFlagStore;
  public readonly teamApiKeys: ITeamApiKeyStore;
  public readonly apiKeyUsage: IApiKeyUsageStore;
  public readonly spans: ISpanStore;
  public readonly appSettings: IAppSettingsStore;
  public readonly externalNodeEnrichment: IExternalNodeEnrichmentStore;

  static getInstance(): StoreRegistry;        // Singleton for production
  static create(database): StoreRegistry;     // Scoped instance for testing
}

function getStores(): StoreRegistry;           // Convenience alias
```

## Store Interfaces

### IServiceStore
```typescript
findById(id: string): Service | undefined
findByIdWithTeam(id: string): ServiceWithTeam | undefined
findAll(options?: ServiceListOptions): Service[]
findAllWithTeam(options?: ServiceListOptions): ServiceWithTeam[]
findActive(): Service[]
findActiveWithTeam(): ServiceWithTeam[]
findByTeamId(teamId: string): Service[]
create(input: ServiceCreateInput): Service
update(id: string, input: ServiceUpdateInput): Service | undefined
delete(id: string): boolean
updatePollResult(serviceId: string, success: boolean, error?: string): void
exists(id: string): boolean
count(options?: ServiceListOptions): number
```

### ITeamStore
```typescript
findById(id: string): Team | undefined
findByName(name: string): Team | undefined
findAll(): Team[]
create(input: TeamCreateInput): Team
update(id: string, input: TeamUpdateInput): Team | undefined
delete(id: string): boolean
findMembers(teamId: string, options?: TeamMemberListOptions): TeamMemberWithUser[]
getMembership(teamId: string, userId: string): TeamMember | undefined
getMembershipsByUserId(userId: string): MembershipWithTeam[]
addMember(teamId: string, userId: string, role: TeamMemberRole): TeamMember
removeMember(teamId: string, userId: string): boolean
removeAllMembershipsForUser(userId: string): number
updateMemberRole(teamId: string, userId: string, role: TeamMemberRole): boolean
isMember(teamId: string, userId: string): boolean
exists(id: string): boolean
count(): number
getMemberCount(teamId: string): number
getServiceCount(teamId: string): number
```

### IUserStore
```typescript
findById(id: string): User | undefined
findByEmail(email: string): User | undefined
findByOidcSubject(oidcSubject: string): User | undefined
findAll(options?: ListOptions): User[]
findActive(options?: ListOptions): User[]
create(input: UserCreateInput): User
update(id: string, input: UserUpdateInput): User | undefined
delete(id: string): boolean
exists(id: string): boolean
existsByEmail(email: string): boolean
count(): number
countActiveAdmins(): number
```

### IDependencyStore
```typescript
findById(id: string): Dependency | undefined
findByServiceId(serviceId: string): Dependency[]
findByServiceIdWithTargets(serviceId: string): DependencyWithTarget[]
findAll(options?: DependencyListOptions): Dependency[]
findAllWithAssociationsAndLatency(options?: { activeServicesOnly?: boolean }): DependencyWithTarget[]
findByServiceIdsWithAssociationsAndLatency(serviceIds: string[]): DependencyWithTarget[]
findExistingByServiceId(serviceId: string): ExistingDependency[]
findDependentReports(serviceId: string): DependentReport[]
upsert(input: DependencyUpsertInput): UpsertResult
updateOverrides(id: string, overrides: DependencyOverrideInput): Dependency | undefined
updateUserEnrichment(id: string, enrichment: DependencyUserEnrichmentInput): Dependency | undefined
findByDiscoverySource(serviceId: string, source: string): Dependency[]
delete(id: string): boolean
deleteByServiceId(serviceId: string): number
exists(id: string): boolean
count(options?: DependencyListOptions): number
```

`DependencyUserEnrichmentInput`: `{ user_display_name?: string | null; user_description?: string | null; user_impact?: string | null }`. Targeted UPDATE that only touches user enrichment columns and `updated_at`. Returns `undefined` if dependency not found.

`findByDiscoverySource(serviceId, source)`: Returns all dependencies for a service filtered by `discovery_source`. Used by the discovered dependencies list endpoint.

`DependencyOverrideInput`: `{ contact_override?: string | null; impact_override?: string | null }`. Targeted UPDATE that only touches `contact_override`, `impact_override`, and `updated_at` — does not interfere with polled data columns. Returns `undefined` if dependency not found. Passing a key with `null` clears that override; omitting a key leaves it unchanged.

`DependencyWithResolvedOverrides`: Extends `Dependency` with `effective_contact: string | null` and `effective_impact: string | null`. Computed at the API layer by `resolveDependencyOverrides(dependencies, teamId?)` in `server/src/utils/dependencyOverrideResolver.ts`, not stored in the database. Used in service detail and list API responses. Uses a 4-tier override hierarchy: instance override > team canonical override > global canonical override > polled data. When `teamId` is provided, team-scoped overrides take precedence over global ones.

### IAssociationStore
```typescript
findById(id: string): DependencyAssociation | undefined
findByDependencyId(dependencyId: string): DependencyAssociation[]
findByDependencyIdWithService(dependencyId: string): AssociationWithService[]
findByLinkedServiceId(linkedServiceId: string): DependencyAssociation[]
findAutoSuggested(dependencyId: string): DependencyAssociation[]
existsForDependencyAndService(dependencyId: string, linkedServiceId: string): boolean
create(input: AssociationCreateInput): DependencyAssociation
confirm(id: string): boolean
dismiss(id: string): boolean
delete(id: string): boolean
deleteByDependencyId(dependencyId: string): number
deleteOldDismissed(olderThan: string): number
exists(id: string): boolean
count(options?: AssociationListOptions): number
```

`findAutoSuggested(dependencyId)`: Returns associations where `is_auto_suggested = 1` and `is_dismissed = 0`.

`confirm(id)`: Sets `is_auto_suggested = 0` (promotes to confirmed). Returns false if not found.

`dismiss(id)`: Sets `is_dismissed = 1`. Returns false if not found. Dismissed associations are never re-suggested.

`deleteOldDismissed(olderThan)`: Deletes associations where `is_dismissed = 1 AND created_at < ?`. Used by `DataRetentionService`.

`AssociationCreateInput`: extended with optional `is_auto_suggested?: boolean` for trace-discovered associations.

### ILatencyHistoryStore
```typescript
record(dependencyId: string, latencyMs: number, timestamp: string): DependencyLatencyHistory
recordWithPercentiles(dependencyId: string, latencyMs: number, percentiles: PercentileInput, timestamp: string, source: string): DependencyLatencyHistory
getStats24h(dependencyId: string): LatencyStats
getAvgLatency24h(dependencyId: string): number | null
getHistory(dependencyId: string, options?: { startTime?: string; endTime?: string; limit?: number }): LatencyDataPoint[]
getLatencyBuckets(dependencyId: string, range: LatencyRange): LatencyBucket[]
getAggregateLatencyBuckets(dependencyIds: string[], range: LatencyRange): LatencyBucket[]
deleteOlderThan(timestamp: string): number
deleteByDependencyId(dependencyId: string): number
```

`PercentileInput`: `{ p50?: number; p95?: number; p99?: number; min?: number; max?: number; requestCount?: number }`.

`recordWithPercentiles`: Stores a latency data point with percentile breakdown. `source` indicates origin (e.g., `'otlp_histogram'`). Used when histogram data is available from OTLP metric pushes.

`LatencyBucket`: `{ timestamp, min, avg, max, count, avg_p50?, avg_p95?, avg_p99? }`. Time-bucketed aggregations with optional averaged percentiles.

`LatencyRange`: `'1h' | '6h' | '24h' | '7d' | '30d'`. Determines bucket granularity (1min for 1h, 5min for 6h, 30min for 24h, 6h for 7d, 1d for 30d).

### IErrorHistoryStore
```typescript
record(dependencyId: string, error: string | null, errorMessage: string | null, timestamp: string): DependencyErrorHistory
getErrors24h(dependencyId: string): ErrorHistoryEntry[]
getLastEntry(dependencyId: string): ErrorHistoryEntry | undefined
isDuplicate(dependencyId: string, error: string | null, errorMessage: string | null): boolean
getErrorCount24h(dependencyId: string): number
deleteOlderThan(timestamp: string): number
deleteByDependencyId(dependencyId: string): number
```

### IDependencyAliasStore
```typescript
findAll(): DependencyAlias[]
findById(id: string): DependencyAlias | undefined
findByAlias(alias: string): DependencyAlias | undefined
getCanonicalNames(): string[]
create(alias: string, canonicalName: string): DependencyAlias
update(id: string, canonicalName: string): DependencyAlias | undefined
delete(id: string): boolean
resolveAlias(name: string): string | null
```

### IAuditLogStore
```typescript
create(entry: Omit<AuditLogEntry, 'id' | 'created_at'>): AuditLogEntry
findAll(options?: AuditLogListOptions): AuditLogEntryWithUser[]
count(options?: AuditLogListOptions): number
deleteOlderThan(timestamp: string): number
```

### ISettingsStore
```typescript
findAll(): Setting[]
findByKey(key: string): Setting | undefined
upsert(key: string, value: string | null, updatedBy: string): Setting
upsertMany(entries: Array<{ key: string; value: string | null }>, updatedBy: string): Setting[]
delete(key: string): boolean
```

### ICanonicalOverrideStore **[Updated for team-scoping]**
```typescript
findAll(teamId?: string): DependencyCanonicalOverride[]
findByCanonicalName(canonicalName: string): DependencyCanonicalOverride | undefined
findByTeamAndCanonicalName(teamId: string, canonicalName: string): DependencyCanonicalOverride | undefined
findForHierarchy(canonicalName: string, teamId?: string): DependencyCanonicalOverride | undefined
upsert(input: CanonicalOverrideUpsertInput): DependencyCanonicalOverride
delete(canonicalName: string): boolean
deleteByTeam(canonicalName: string, teamId: string): boolean
```

`CanonicalOverrideUpsertInput`: `{ canonical_name: string; team_id?: string | null; contact_override?: string | null; impact_override?: string | null; manifest_managed?: number; updated_by: string }`. When `team_id` is provided, upserts against the `(team_id, canonical_name) WHERE team_id IS NOT NULL` partial unique index. When `team_id` is null/omitted, upserts against the `(canonical_name) WHERE team_id IS NULL` global index. Preserves `created_at` on conflict.

`findAll(teamId?)`: Without argument returns all overrides (global + team-scoped). With `teamId` filters to only that team's overrides.

`findByCanonicalName`: Returns only global overrides (where `team_id IS NULL`).

`findByTeamAndCanonicalName`: Returns only the team-scoped override for a specific team.

`findForHierarchy(canonicalName, teamId?)`: Resolves the best override using the hierarchy: team-scoped first, then global fallback. Returns `undefined` if neither exists.

`deleteByTeam`: Deletes a team-scoped override without affecting global overrides.

### IStatusChangeEventStore
```typescript
record(serviceId: string, serviceName: string, dependencyName: string, previousHealthy: boolean | null, currentHealthy: boolean, timestamp: string): StatusChangeEventRow
getRecent(limit: number): StatusChangeEventRow[]
getUnstable(hours: number, limit: number): UnstableDependencyRow[]
deleteOlderThan(timestamp: string): number
```

`UnstableDependencyRow`: `{ dependency_name, service_name, service_id, change_count, current_healthy, last_change_at }`. Aggregates status changes within the time window grouped by dependency name. Returns the service from the most recent event for each dependency.

### IAlertChannelStore **[Implemented]**
```typescript
findById(id: string): AlertChannel | undefined
findByTeamId(teamId: string): AlertChannel[]
findActiveByTeamId(teamId: string): AlertChannel[]
create(input: CreateAlertChannelInput): AlertChannel
update(id: string, input: UpdateAlertChannelInput): AlertChannel | undefined
delete(id: string): boolean
```

`CreateAlertChannelInput`: `{ team_id: string; channel_type: 'slack' | 'webhook'; config: string }`. `config` is a JSON string.

`UpdateAlertChannelInput`: `{ channel_type?: string; config?: string; is_active?: boolean }`. Partial update — only provided fields are modified.

### IAlertRuleStore **[Implemented]**
```typescript
findById(id: string): AlertRule | undefined
findByTeamId(teamId: string): AlertRule[]
findActiveByTeamId(teamId: string): AlertRule[]
create(input: CreateAlertRuleInput): AlertRule
update(id: string, input: UpdateAlertRuleInput): AlertRule | undefined
delete(id: string): boolean
```

`CreateAlertRuleInput`: `{ team_id: string; severity_filter: AlertSeverityFilter }`. Creates with defaults: `is_active = 1`, `use_custom_thresholds = 0`, `cooldown_minutes = null`, `rate_limit_per_hour = null`.

`UpdateAlertRuleInput`: `{ severity_filter?: AlertSeverityFilter; is_active?: boolean; use_custom_thresholds?: boolean; cooldown_minutes?: number | null; rate_limit_per_hour?: number | null }`. Booleans are converted to INTEGER (0/1) in the store layer. `cooldown_minutes` and `rate_limit_per_hour` accept `null` to clear the override.

### IAlertHistoryStore **[Implemented]**
```typescript
create(entry: Omit<AlertHistoryEntry, 'id'>): AlertHistoryEntry
findByChannelId(channelId: string, options?: AlertHistoryListOptions): AlertHistoryEntry[]
findByTeamId(teamId: string, options?: AlertHistoryListOptions): AlertHistoryEntry[]
count(options?: AlertHistoryListOptions): number
deleteOlderThan(timestamp: string): number
```

`AlertHistoryListOptions`: `{ limit?: number; offset?: number; channelId?: string; serviceId?: string; status?: string; startDate?: string; endDate?: string }`. Filters are composable. `findByTeamId` joins through `alert_channels` to find history for all of a team's channels.

### IManifestConfigStore **[Implemented]**
```typescript
create(input: ManifestConfigCreateInput): TeamManifestConfig
findByTeamId(teamId: string): TeamManifestConfig | undefined
update(teamId: string, input: ManifestConfigUpdateInput): TeamManifestConfig | undefined
delete(teamId: string): boolean
findAllEnabled(): TeamManifestConfig[]
updateSyncResult(teamId: string, result: ManifestSyncResultInput): boolean
```

`ManifestConfigCreateInput`: `{ team_id: string; manifest_url: string; is_enabled?: boolean; sync_policy?: ManifestSyncPolicy }`. Uses `INSERT ... ON CONFLICT(team_id) DO UPDATE` for upsert semantics. Types imported from `server/src/services/manifest/types.ts`.

`ManifestConfigUpdateInput`: `{ manifest_url?: string; is_enabled?: boolean; sync_policy?: Partial<ManifestSyncPolicy> }`. Partial sync_policy is merged with existing policy (or `DEFAULT_SYNC_POLICY` if no existing policy). Dynamic field building for partial updates.

`ManifestSyncResultInput`: `{ last_sync_at: string; last_sync_status: string; last_sync_error: string | null; last_sync_summary: string | null }`. Updates only the sync result columns without touching config fields.

`findAllEnabled()` returns all configs where `is_enabled = 1`, ordered by `created_at ASC`. Used by the scheduled sync loop.

### IManifestSyncHistoryStore **[Implemented]**
```typescript
create(entry: ManifestSyncHistoryCreateInput): ManifestSyncHistoryEntry
findByTeamId(teamId: string, options?: { limit?: number; offset?: number }): { history: ManifestSyncHistoryEntry[]; total: number }
deleteOlderThan(timestamp: string): number
```

`ManifestSyncHistoryCreateInput`: `{ team_id, trigger_type, triggered_by, manifest_url, status, summary, errors, warnings, duration_ms }`. `triggered_by` is null for scheduled syncs. `summary`, `errors`, `warnings` are JSON strings.

`findByTeamId` returns paginated results (default limit 20, max 100) ordered by `created_at DESC` (most recent first), along with a total count for pagination UI. Types imported from `server/src/services/manifest/types.ts`.

### IDriftFlagStore **[Implemented]**
```typescript
// Read
findById(id: string): DriftFlag | undefined
findByTeamId(teamId: string, options?: DriftFlagListOptions): { flags: DriftFlagWithContext[]; total: number }
findActiveByServiceId(serviceId: string): DriftFlag[]
findActiveByServiceAndField(serviceId: string, fieldName: string): DriftFlag | undefined
findActiveRemovalByServiceId(serviceId: string): DriftFlag | undefined
countByTeamId(teamId: string): DriftSummary

// Write
create(input: DriftFlagCreateInput): DriftFlag
resolve(id: string, status: 'dismissed' | 'accepted' | 'resolved', userId: string | null): boolean
reopen(id: string): boolean
updateDetection(id: string, manifestValue: string | null, currentValue: string | null): boolean
updateLastDetectedAt(id: string): boolean

// Bulk
bulkResolve(ids: string[], status: 'dismissed' | 'accepted' | 'resolved', userId: string | null): number
resolveAllForService(serviceId: string): number
resolveAllForTeam(teamId: string): number

// Upsert (sync engine)
upsertFieldDrift(serviceId: string, fieldName: string, manifestValue: string, currentValue: string, syncHistoryId: string | null): DriftFlagUpsertResult
upsertRemovalDrift(serviceId: string, syncHistoryId: string | null): DriftFlagUpsertResult

// Cleanup
deleteOlderThan(timestamp: string, statuses?: DriftFlagStatus[]): number
```

`DriftFlagListOptions`: `{ status?: DriftFlagStatus; drift_type?: string; service_id?: string; limit?: number; offset?: number }`. Default limit 50, max 250. Filters are composable.

`findByTeamId` returns paginated results joined with `services` (for `service_name`, `manifest_key`) and `users` (for `resolved_by_name`), ordered by `last_detected_at DESC`.

`countByTeamId` uses a single query with `SUM(CASE ...)` expressions for efficient summary counts: `pending_count`, `dismissed_count`, `field_change_pending`, `service_removal_pending`.

`resolve` only transitions flags in `pending` or `dismissed` status. `reopen` only transitions `dismissed` → `pending`.

**Upsert deduplication logic** (critical for preventing alert fatigue):
- `upsertFieldDrift`: pending exists → update values; dismissed with same manifest_value → update last_detected_at only (stay dismissed); dismissed with different manifest_value → re-flag as pending; not found → create new
- `upsertRemovalDrift`: pending or dismissed exists → update last_detected_at (stay in current status); not found → create new

`deleteOlderThan` supports optional status filter array for targeted cleanup (e.g., only delete terminal statuses like `accepted`, `resolved`).

### ITeamApiKeyStore **[Implemented]**
```typescript
findByTeamId(teamId: string): TeamApiKey[]
findByKeyHash(hash: string): TeamApiKey | undefined
findById(id: string): TeamApiKey | undefined
create(input: CreateTeamApiKeyInput): TeamApiKey & { rawKey: string }
delete(id: string): boolean
updateLastUsed(id: string): void
updateRateLimit(id: string, rateLimit: number | null): TeamApiKey
setAdminLock(id: string, locked: boolean, rateLimit?: number | null): TeamApiKey
```

`CreateTeamApiKeyInput`: `{ team_id: string; name: string; created_by?: string }`. Generates a UUID `id`, raw key (`dps_` + 16 random hex bytes), SHA-256 hash, and 8-character prefix. Returns the full `TeamApiKey` record plus `rawKey` (shown once, never stored).

`findByTeamId` returns keys sorted by `created_at DESC`.

`findByKeyHash` is the primary lookup used during authentication — indexed for fast access.

`findById` is used by the per-key rate limiter to look up the key's effective rate limit and by the rate limit management endpoints.

`updateLastUsed` sets `last_used_at` to current timestamp. Called asynchronously during API key auth (non-critical failure).

`updateRateLimit` sets `rate_limit_rpm` to the given value (positive integer, null for system default). Returns the updated `TeamApiKey`. Used by both team-level and admin rate limit endpoints.

`setAdminLock` sets `rate_limit_admin_locked` (0 or 1) and optionally updates `rate_limit_rpm` in the same operation (uses SQL `COALESCE` to skip rate limit update when not provided). Returns the updated `TeamApiKey`. Admin-only.

### IApiKeyUsageStore **[Implemented]**
```typescript
bulkUpsert(entries: BulkUpsertEntry[]): void
getBuckets(apiKeyId: string, granularity: 'minute' | 'hour', from: string, to: string): ApiKeyUsageBucket[]
getBucketsByTeam(teamId: string, granularity: 'minute' | 'hour', from: string, to: string): (ApiKeyUsageBucket & { key_name: string; key_prefix: string })[]
getAllBuckets(granularity: 'minute' | 'hour', from: string, to: string): (ApiKeyUsageBucket & { team_id: string; key_name: string })[]
getSummaryForKeys(apiKeyIds: string[], from: string, to: string): Map<string, { push_count: number; rejected_count: number }>
pruneMinuteBuckets(olderThan: string): number
pruneHourBuckets(olderThan: string): number
pruneOrphanedBuckets(olderThan: string): number
```

`BulkUpsertEntry`: `{ api_key_id: string; bucket_start: string; granularity: 'minute' | 'hour'; push_count: number; rejected_count: number }`. Uses `INSERT ... ON CONFLICT DO UPDATE SET push_count = push_count + excluded.push_count, rejected_count = rejected_count + excluded.rejected_count` for atomic accumulation.

`getBuckets` returns time-series buckets for a single key, ordered by `bucket_start ASC`.

`getBucketsByTeam` joins through `team_api_keys` to return buckets for all keys belonging to a team, enriched with key metadata.

`getAllBuckets` returns buckets across all keys (admin dashboard), enriched with `team_id` and `key_name`.

`getSummaryForKeys` returns aggregated `push_count` and `rejected_count` totals for a set of key IDs within a time range. Used by the OTLP stats endpoints for usage summaries (1h, 24h, 7d windows).

**Retention pruning:**
- `pruneMinuteBuckets(olderThan)` — deletes minute-granularity buckets older than the given timestamp (24h retention)
- `pruneHourBuckets(olderThan)` — deletes hour-granularity buckets older than the given timestamp (30d retention)
- `pruneOrphanedBuckets(olderThan)` — deletes buckets where `api_key_id` no longer exists in `team_api_keys` and `bucket_start` is older than the given timestamp (7d grace period)

### ISpanStore **[Implemented]**
```typescript
bulkInsert(spans: CreateSpanInput[]): number
findByTraceId(traceId: string): Span[]
findByServiceName(serviceName: string, options?: { since?: string; limit?: number }): Span[]
deleteOlderThan(timestamp: string): number
```

`bulkInsert`: Inserts multiple spans in a transaction using a prepared statement for batch performance. Generates UUIDs for each span. Returns the number of spans inserted.

`findByTraceId`: Returns all spans for a trace ordered by `start_time ASC`. Used for trace timeline reconstruction.

`findByServiceName`: Returns spans filtered by service name, optionally filtered by `since` timestamp. Default limit 1000, ordered by `start_time DESC`.

`deleteOlderThan`: Deletes spans where `created_at < timestamp`. Used by `DataRetentionService` for configurable span retention cleanup.

### IAppSettingsStore **[Implemented]**
```typescript
get(key: string): string | undefined
set(key: string, value: string, updatedBy?: string): void
```

Simple key-value store for admin-configurable settings. `get` returns `undefined` for missing keys. `set` uses `INSERT OR REPLACE` (upsert semantics). Used by `DataRetentionService` to read `span_retention_days` and by the admin settings endpoints.

### IExternalNodeEnrichmentStore **[Implemented]**
```typescript
findByCanonicalName(name: string): ExternalNodeEnrichment | undefined
findAll(): ExternalNodeEnrichment[]
upsert(input: UpsertExternalNodeEnrichmentInput): ExternalNodeEnrichment
delete(id: string): boolean
```

`findByCanonicalName`: Exact match lookup by canonical name.

`findAll`: Returns all enrichment records ordered by `canonical_name`.

`upsert`: Uses `INSERT ... ON CONFLICT(canonical_name) DO UPDATE` for idempotent creates/updates. Returns the created or updated record.

`delete`: Hard deletes by ID. Returns false if not found.
