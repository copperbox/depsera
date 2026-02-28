# Manifest Sync Service

## Overview

The ManifestSyncService orchestrates manifest-driven service synchronization with drift detection. Teams configure a manifest URL pointing to a JSON file that declaratively defines services, aliases, canonical overrides, and associations. The sync engine fetches, validates, diffs, and applies changes — flagging manual edits as "drift" for review.

**File:** `server/src/services/manifest/ManifestSyncService.ts`

## Architecture

### Singleton Pattern

Follows the same pattern as `HealthPollingService`:

```typescript
ManifestSyncService.getInstance()   // Production singleton
ManifestSyncService.resetInstance() // Testing cleanup
ManifestSyncService.createForTesting(stores) // Dependency injection for tests
```

### EventEmitter

Typed events via `EventEmitter`:

| Event | Payload | Emitted When |
|---|---|---|
| `SYNC_COMPLETE` | `{ teamId, summary, duration }` | Successful sync |
| `SYNC_ERROR` | `{ teamId, error }` | Sync fails with exception |
| `DRIFT_DETECTED` | `{ teamId, driftCount }` | New drift flags created |

## Sync Pipeline

`syncTeam(teamId, triggerType, triggeredBy)` executes the full sync pipeline:

1. **Load config** — `manifestConfig.findByTeamId()`, return early if not found or disabled
2. **Parse sync policy** — JSON parse `sync_policy` field, fallback to `DEFAULT_SYNC_POLICY` on parse error
3. **Acquire lock** — Per-team in-memory lock prevents concurrent syncs (5-minute stale timeout)
4. **Fetch** — `fetchManifest(url)` with SSRF protection, timeout, size limits
5. **Validate** — `validateManifest(data)` with 3-level structural/semantic validation
6. **SSRF check** — `Promise.allSettled` on all health/metrics endpoints; blocked entries are filtered out with warnings
7. **Diff** — `diffManifest(manifestEntries, existingServices, policy)` computes changes
8. **Apply** (within `withTransaction`):
   - Create new services (raw DB for `manifest_key`, `manifest_managed`, `manifest_last_synced_values`)
   - Update changed services (raw DB for `manifest_last_synced_values`)
   - Upsert field drift flags for drift entries
   - Upsert removal drift flags
   - Deactivate/delete removed services per policy
   - Auto-resolve stale removal drift when service reappears in manifest
9. **Sync metadata** (within same transaction):
   - Aliases — team-scoped via raw DB insert (DependencyAliasStore doesn't support `manifest_team_id`)
   - Canonical overrides — team-scoped via `canonicalOverrides.upsert()`
   - Associations — manifest-managed via raw DB for `manifest_managed` column
10. **Polling integration** — Start/restart/stop polling for affected services
11. **Record results** — Update config sync status, create sync history entry
12. **Audit log** — Fire-and-forget audit event
13. **Release lock** — Always releases in finally block

### Raw DB Access Pattern

Several store interfaces don't include manifest-specific columns (`manifest_key`, `manifest_managed`, `manifest_last_synced_values`, `manifest_team_id`). The sync service uses raw DB access via `(store as any).db.prepare(...)` for these operations. This is a pragmatic choice to avoid widening store interfaces with columns only used by the sync engine. Future work (DPS-59e) will add proper types.

## Concurrency Control

- **Per-team sync lock**: In-memory `Map<string, { locked, timestamp }>`. Only one sync per team at a time.
- **Stale lock timeout**: 5 minutes — if a lock is older than 5 minutes, it's considered stale and can be acquired.
- **Manual sync cooldown**: 60 seconds per team. `canManualSync(teamId)` returns `{ allowed, retryAfterMs? }`.
- **Shutting down guard**: Rejects new syncs when `isShuttingDown` flag is set.

## Scheduling

- **`start()`** — Creates a 60-second check interval via `setInterval`
- **`checkSchedule()`** — Loads all enabled configs, syncs teams where `last_sync_at` is older than the sync interval
- **Sync interval**: Default 1 hour (3,600,000ms), configurable via `MANIFEST_SYNC_INTERVAL_MS` env var
- **Sequential execution**: Teams are synced one at a time (not parallel) to limit resource usage
- **Disable**: Set `MANIFEST_SYNC_ENABLED=false` or `MANIFEST_SYNC_ENABLED=0` to disable scheduled sync

## Shutdown

`shutdown()` provides graceful shutdown:

1. Set `isShuttingDown` flag (rejects new syncs)
2. Clear schedule interval
3. Wait up to 30 seconds for in-progress syncs to complete (polls every 500ms)

Safe to call multiple times.

## Audit Logging

Uses `logAuditEvent()` (fire-and-forget) with action `manifest_sync` (cast as `any` until DPS-59e adds proper type):

- Manual syncs: `userId` from the triggering user
- Scheduled syncs: `userId = 'system'`
- Details include: trigger type, status, summary, service count, error count

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MANIFEST_SYNC_ENABLED` | `true` | Set to `false` or `0` to disable scheduled sync |
| `MANIFEST_SYNC_INTERVAL_MS` | `3600000` | Interval between scheduled syncs (milliseconds) |

## Sync Policy

Policy is stored as JSON in `team_manifest_config.sync_policy`. Parsed per-sync with fallback to `DEFAULT_SYNC_POLICY`:

```typescript
interface ManifestSyncPolicy {
  on_field_drift: 'flag' | 'manifest_wins' | 'local_wins';
  on_removal: 'flag' | 'deactivate' | 'delete';
  on_alias_removal: 'remove' | 'keep';
  on_override_removal: 'remove' | 'keep';
  on_association_removal: 'remove' | 'keep';
}

const DEFAULT_SYNC_POLICY: ManifestSyncPolicy = {
  on_field_drift: 'flag',
  on_removal: 'flag',
  on_alias_removal: 'remove',
  on_override_removal: 'remove',
  on_association_removal: 'remove',
};
```

## Return Type

`syncTeam()` returns `ManifestSyncResult`:

```typescript
interface ManifestSyncResult {
  status: 'success' | 'partial' | 'failed';
  summary: ManifestSyncSummary;
  errors: string[];
  warnings: string[];
  changes: ManifestSyncChange[];
  duration_ms: number;
}
```

## Tests

33 tests in `ManifestSyncService.test.ts` covering:

- Early returns (config not found, disabled, fetch failure, validation failure)
- Success flow (empty manifest, creates, updates, drift flags, deactivation, deletion, unchanged)
- SSRF filtering (skips services with blocked endpoints)
- Events (SYNC_COMPLETE, DRIFT_DETECTED, SYNC_ERROR)
- Concurrency (canManualSync, cooldown, isSyncing)
- Sync policy parsing (default, custom JSON, invalid JSON fallback)
- Polling integration (restart on endpoint change, no restart for name-only change)
- Audit logging (user context for manual, system user for scheduled)
- Scheduling (start, disable via env, idempotent)
- Shutdown (stops scheduler, safe to call multiple times)
- Alias sync (creates team-scoped aliases)
- Override sync (creates team-scoped overrides)
- Auto-resolve stale drift (resolves removal drift when service reappears)

## API Routes

**[Implemented]** (DPS-57)

**File:** `server/src/routes/manifest/index.ts`

Exports two routers:
- `manifestTeamRouter` — team-scoped routes mounted under `/api/teams`
- `manifestRouter` — standalone routes mounted at `/api/manifest`

### Configuration Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/teams/:id/manifest` | requireTeamAccess | Get manifest config (returns `null` if none) |
| PUT | `/api/teams/:id/manifest` | requireTeamLead | Upsert manifest config with SSRF URL validation |
| DELETE | `/api/teams/:id/manifest` | requireTeamLead | Remove config (does not delete services) |

### Sync Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/teams/:id/manifest/sync` | requireTeamAccess | Trigger manual sync (409/429/404/400 guards) |
| GET | `/api/teams/:id/manifest/sync-history` | requireTeamAccess | Paginated sync history (limit/offset) |

### Validation Route

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/manifest/validate` | requireAuth | Dry-run manifest validation |

### Validation

- `manifest_url`: required, validated with `validateUrlHostname()` synchronous SSRF check
- `sync_policy`: optional partial object, each field validated against allowed enum values
- Sync guards: config existence check → disabled check → in-progress check → cooldown check

### Tests

28 tests in `manifest.test.ts` covering:

- Configuration CRUD (GET returns null/config, PUT creates/updates with validation, DELETE removes)
- SSRF URL rejection (localhost, private IPs blocked)
- Sync policy validation (invalid enum values rejected, non-object rejected)
- Auth enforcement (team leads for mutations, members for reads, non-members denied)
- Sync trigger guards (404 no config, 400 disabled, 409 in-progress, 429 cooldown with Retry-After)
- Sync history pagination
- Manifest validation endpoint (valid/invalid/warnings)
