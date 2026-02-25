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

`DependencyWithResolvedOverrides`: Extends `Dependency` with `effective_contact: string | null` and `effective_impact: string | null`. Computed at the API layer by `resolveDependencyOverrides()` in `server/src/utils/dependencyOverrideResolver.ts`, not stored in the database. Used in service detail and list API responses.

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

### ICanonicalOverrideStore
```typescript
findAll(): DependencyCanonicalOverride[]
findByCanonicalName(canonicalName: string): DependencyCanonicalOverride | undefined
upsert(input: CanonicalOverrideUpsertInput): DependencyCanonicalOverride
delete(canonicalName: string): boolean
```

`CanonicalOverrideUpsertInput`: `{ canonical_name: string; contact_override?: string | null; impact_override?: string | null; updated_by: string }`. Upsert uses `INSERT ... ON CONFLICT(canonical_name) DO UPDATE` to update override values and audit fields while preserving the original `created_at`.

### IStatusChangeEventStore
```typescript
record(serviceId: string, serviceName: string, dependencyName: string, previousHealthy: boolean | null, currentHealthy: boolean, timestamp: string): StatusChangeEventRow
getRecent(limit: number): StatusChangeEventRow[]
getUnstable(hours: number, limit: number): UnstableDependencyRow[]
deleteOlderThan(timestamp: string): number
```

`UnstableDependencyRow`: `{ dependency_name, service_name, service_id, change_count, current_healthy, last_change_at }`. Aggregates status changes within the time window grouped by dependency name. Returns the service from the most recent event for each dependency.
