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
  public readonly manifestConfig: IManifestConfigStore;
  public readonly manifestSyncHistory: IManifestSyncHistoryStore;
  public readonly driftFlags: IDriftFlagStore;

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
delete(id: string): boolean
deleteByServiceId(serviceId: string): number
exists(id: string): boolean
count(options?: DependencyListOptions): number
```

`DependencyOverrideInput`: `{ contact_override?: string | null; impact_override?: string | null }`. Targeted UPDATE that only touches `contact_override`, `impact_override`, and `updated_at` — does not interfere with polled data columns. Returns `undefined` if dependency not found. Passing a key with `null` clears that override; omitting a key leaves it unchanged.

`DependencyWithResolvedOverrides`: Extends `Dependency` with `effective_contact: string | null` and `effective_impact: string | null`. Computed at the API layer by `resolveDependencyOverrides(dependencies, teamId?)` in `server/src/utils/dependencyOverrideResolver.ts`, not stored in the database. Used in service detail and list API responses. Uses a 4-tier override hierarchy: instance override > team canonical override > global canonical override > polled data. When `teamId` is provided, team-scoped overrides take precedence over global ones.

### IAssociationStore
```typescript
findById(id: string): DependencyAssociation | undefined
findByDependencyId(dependencyId: string): DependencyAssociation[]
findByDependencyIdWithService(dependencyId: string): AssociationWithService[]
findByLinkedServiceId(linkedServiceId: string): DependencyAssociation[]
findPendingSuggestions(): AssociationWithContext[]
existsForDependencyAndService(dependencyId: string, linkedServiceId: string): boolean
create(input: AssociationCreateInput): DependencyAssociation
delete(id: string): boolean
deleteByDependencyId(dependencyId: string): number
acceptSuggestion(id: string): boolean
dismissSuggestion(id: string): boolean
reactivateDismissed(id: string, associationType: AssociationType): boolean
exists(id: string): boolean
count(options?: AssociationListOptions): number
```

### ILatencyHistoryStore
```typescript
record(dependencyId: string, latencyMs: number, timestamp: string): DependencyLatencyHistory
getStats24h(dependencyId: string): LatencyStats
getAvgLatency24h(dependencyId: string): number | null
getHistory(dependencyId: string, options?: { startTime?: string; endTime?: string; limit?: number }): LatencyDataPoint[]
deleteOlderThan(timestamp: string): number
deleteByDependencyId(dependencyId: string): number
```

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
