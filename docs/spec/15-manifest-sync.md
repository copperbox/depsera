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

## Drift Flag Routes

**[Implemented]** (DPS-58)

**File:** `server/src/routes/drifts/index.ts`

Exports `driftRouter` — team-scoped routes mounted under `/api/teams`.

### List & Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/teams/:id/drifts` | requireTeamAccess | List drift flags with filtering. Default `status=pending`. Max limit 250. Always includes `summary`. |
| GET | `/api/teams/:id/drifts/summary` | requireTeamAccess | Lightweight badge counts only. |

**GET /api/teams/:id/drifts query params:**

- `status` — `pending` (default), `dismissed`, `accepted`, `resolved`
- `drift_type` — `field_change`, `service_removal`
- `service_id` — filter by service UUID
- `limit` — max 250, default 50
- `offset` — default 0

**GET /api/teams/:id/drifts response:**

```json
{
  "flags": [DriftFlagWithContext],
  "summary": { "pending_count": 2, "dismissed_count": 1, "field_change_pending": 1, "service_removal_pending": 1 },
  "total": 2
}
```

### Single Flag Actions

| Method | Path | Auth | Description |
|---|---|---|---|
| PUT | `/api/teams/:id/drifts/:driftId/accept` | requireTeamLead | Accept drift flag. Applies manifest value to service. |
| PUT | `/api/teams/:id/drifts/:driftId/dismiss` | requireTeamLead | Dismiss flag (stays visible in dismissed view). |
| PUT | `/api/teams/:id/drifts/:driftId/reopen` | requireTeamLead | Reopen a dismissed flag back to pending. |

**Accept behavior:**

- `field_change`: Updates service field to `manifest_value`. Re-validates SSRF for URL fields. Validates `poll_interval_ms` bounds (5000–3600000). Updates `manifest_last_synced_values` snapshot. Restarts polling if `health_endpoint` or `poll_interval_ms` changed.
- `service_removal`: Deactivates service (`is_active=0`), stops polling.
- Returns 409 if flag already accepted/resolved.
- Returns 400 if SSRF validation fails for URL fields.

### Bulk Actions

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/teams/:id/drifts/bulk-accept` | requireTeamLead | Bulk accept (max 100 flags). Best-effort SSRF. Transaction. |
| POST | `/api/teams/:id/drifts/bulk-dismiss` | requireTeamLead | Bulk dismiss (max 100 flags). Transaction. |

**POST body:** `{ "flag_ids": ["id1", "id2", ...] }`

**Response:** `{ "result": { "succeeded": 2, "failed": 0, "errors": [] } }`

### Audit Actions

- `drift.accepted`, `drift.dismissed`, `drift.reopened` — single flag actions (resource_type: `service`)
- `drift.bulk_accepted`, `drift.bulk_dismissed` — bulk actions (resource_type: `team`)

### Tests

55 tests in `drifts.test.ts` covering:

- List with default pending filter and all query param filters (status, drift_type, service_id, limit, offset)
- Summary endpoint with correct counts
- Invalid filter parameter rejection
- Auth enforcement (team leads for mutations, members for reads, non-members denied)
- Accept field_change (service update, synced snapshot update, polling restart for endpoint/interval changes)
- Accept service_removal (deactivation, polling stop)
- SSRF rejection on accept for URL fields
- poll_interval_ms bounds validation on accept
- 409 for already accepted/resolved flags
- 404 for non-existent or wrong-team flags
- Dismiss, reopen with correct status transitions
- Reopen rejects non-dismissed flags (400)
- Bulk accept with mixed field_change and service_removal
- Bulk accept best-effort (SSRF failures skip individual flags)
- Bulk dismiss with transaction
- Bulk validation (empty array, max 100 limit)
- Audit events for all single and bulk operations

## Server Integration

**[Implemented]** (DPS-59)

**File:** `server/src/index.ts`

### Startup Sequence

ManifestSyncService is initialized and started after AlertService and DataRetentionService:

1. SettingsService → HealthPollingService → AlertService → DataRetentionService → **ManifestSyncService** → pollingService.startAll()

```typescript
const manifestSyncService = ManifestSyncService.getInstance();
manifestSyncService.start();
```

### Route Registration

Routes are mounted in `server/src/index.ts`:

```typescript
app.use('/api/teams', requireAuth, manifestTeamRouter);  // team-scoped config/sync
app.use('/api/teams', requireAuth, driftRouter);          // team-scoped drift flags
app.use('/api/manifest', requireAuth, manifestRouter);    // standalone validate endpoint
```

### Shutdown Sequence

Shutdown order: AlertService → DataRetentionService → **ManifestSyncService** → HealthPollingService → closeDatabase

ManifestSyncService shuts down before HealthPollingService because sync operations may start/restart polls for services.

### Data Retention

**File:** `server/src/services/retention/DataRetentionService.ts`

Extended to clean up manifest-related data using a fixed 90-day retention period (independent of the configurable `data_retention_days` setting):

- `manifest_sync_history` — records older than 90 days are deleted
- `drift_flags` — only terminal flags (`accepted`, `resolved`) older than 90 days are deleted; `pending` and `dismissed` flags are never auto-deleted

New fields in `CleanupResult`: `syncHistoryDeleted`, `driftFlagsDeleted`.

### Audit Action Types

**File:** `server/src/db/types.ts`

Added to `AuditAction` type union:

- `manifest_sync` — sync operations (manual and scheduled)
- `manifest_config.created`, `manifest_config.updated`, `manifest_config.deleted` — config CRUD
- `drift.detected`, `drift.accepted`, `drift.dismissed`, `drift.reopened`, `drift.resolved` — single flag actions
- `drift.bulk_accepted`, `drift.bulk_dismissed` — bulk actions

Added to `AuditResourceType`: `manifest_config`, `drift_flag`.

All `as any` casts in manifest routes, drift routes, and ManifestSyncService have been removed now that proper types are registered.

### Tests

4 tests added to `DataRetentionService.test.ts` covering:

- Manifest sync history cleanup with 90-day fixed cutoff
- Terminal drift flags cleanup (only `accepted` and `resolved` statuses)
- Fixed 90-day retention independent of configurable retention days
- Manifest counts included in cleanup result logging

## Client Layer

**[Implemented]** (DPS-60)

### Types

**File:** `client/src/types/manifest.ts`

Client-side TypeScript types mirroring server types for the manifest and drift flag domain:

- **Sync policy:** `ManifestSyncPolicy`, `FieldDriftPolicy`, `RemovalPolicy`, `MetadataRemovalPolicy`
- **Config:** `TeamManifestConfig`, `ManifestConfigInput`
- **Sync results:** `ManifestSyncResult`, `ManifestSyncSummary`, `ManifestSyncChange`
- **Sync history:** `ManifestSyncHistoryEntry`
- **Validation:** `ManifestValidationResult`, `ManifestValidationIssue`, `ManifestValidationSeverity`
- **Drift flags:** `DriftFlagWithContext`, `DriftSummary`, `DriftType`, `DriftFlagStatus`, `BulkDriftActionResult`
- **API responses:** `DriftFlagsResponse`, `SyncHistoryResponse`, `DriftFlagListOptions`, `SyncHistoryListOptions`

### API Client

**File:** `client/src/api/manifest.ts`

All functions use `credentials: 'include'` and `withCsrfToken` for mutations.

| Function | Method | Endpoint | Returns |
|---|---|---|---|
| `getManifestConfig(teamId)` | GET | `/api/teams/:id/manifest` | `TeamManifestConfig \| null` |
| `saveManifestConfig(teamId, input)` | PUT | `/api/teams/:id/manifest` | `TeamManifestConfig` |
| `removeManifestConfig(teamId)` | DELETE | `/api/teams/:id/manifest` | `void` |
| `triggerSync(teamId)` | POST | `/api/teams/:id/manifest/sync` | `ManifestSyncResult` |
| `getSyncHistory(teamId, options?)` | GET | `/api/teams/:id/manifest/sync-history` | `SyncHistoryResponse` |
| `validateManifest(manifestJson)` | POST | `/api/manifest/validate` | `ManifestValidationResult` |
| `getDriftFlags(teamId, options?)` | GET | `/api/teams/:id/drifts` | `DriftFlagsResponse` |
| `getDriftSummary(teamId)` | GET | `/api/teams/:id/drifts/summary` | `DriftSummary` |
| `acceptDrift(teamId, driftId)` | PUT | `.../drifts/:id/accept` | `DriftFlagWithContext` |
| `dismissDrift(teamId, driftId)` | PUT | `.../drifts/:id/dismiss` | `DriftFlagWithContext` |
| `reopenDrift(teamId, driftId)` | PUT | `.../drifts/:id/reopen` | `DriftFlagWithContext` |
| `bulkAcceptDrifts(teamId, flagIds)` | POST | `.../drifts/bulk-accept` | `BulkDriftActionResult` |
| `bulkDismissDrifts(teamId, flagIds)` | POST | `.../drifts/bulk-dismiss` | `BulkDriftActionResult` |

### Hooks

**`useManifestConfig(teamId)`** — `client/src/hooks/useManifestConfig.ts`

State management for manifest configuration and sync triggering. Follows `useAlertChannels` pattern.

- State: `config`, `isLoading`, `error`, `isSaving`, `isSyncing`, `syncResult`
- Actions: `loadConfig`, `saveConfig`, `removeConfig`, `toggleEnabled`, `triggerSync`, `clearError`, `clearSyncResult`
- `triggerSync` reloads config after completion to reflect updated sync status

**`useDriftFlags(teamId)`** — `client/src/hooks/useDriftFlags.ts`

State management for drift flag listing, filtering, selection, and actions. Follows `useSuggestions` pattern.

- State: `flags`, `filtered`, `summary`, `isLoading`, `error`
- View: `view` (`pending`/`dismissed`), `setView` (clears selection on change)
- Filters: `typeFilter`, `serviceFilter` with setters — client-side filtering via `useMemo`
- Selection: `selectedIds` (Set), `toggleSelected`, `selectAll`, `clearSelection`
- Actions: `accept`, `dismiss`, `reopen`, `bulkAccept`, `bulkDismiss` — all auto-reload after completion
- Bulk operations clear selection on success

**`useSyncHistory(teamId)`** — `client/src/hooks/useSyncHistory.ts`

Paginated sync history with load-more pattern. Page size of 20.

- State: `history`, `total`, `isLoading`, `hasMore`, `error`
- Actions: `loadHistory` (reset to page 1), `loadMore` (append next page), `clearError`
- Internal offset tracking via `useRef`

### Tests

- 34 tests in `manifest.test.ts` covering all 13 API client functions (success, error, query params, response unwrapping)
- 26 tests in `useManifestConfig.test.ts` covering load/save/remove/toggle/sync with error handling
- 25 tests in `useDriftFlags.test.ts` covering load/filter/select/accept/dismiss/reopen/bulk with error handling
- 12 tests in `useSyncHistory.test.ts` covering load/loadMore/pagination/offset reset with error handling

## Manifest Badges & Warnings

**[Implemented]** (DPS-64)

### API Changes

`manifest_managed` and `manifest_key` are now included in all service API responses:

- `GET /api/services` — list endpoint includes both fields via `extractServiceFields()`
- `GET /api/services/:id` — detail endpoint includes both fields
- `POST /api/services` and `PUT /api/services/:id` — mutation responses include both fields
- `GET /api/teams/:id` — team detail services already included these via `SELECT *`

**Files modified:**
- `server/src/routes/formatters/serviceFormatter.ts` — `extractServiceFields()` now includes `manifest_managed` and `manifest_key`
- `server/src/routes/formatters/types.ts` — `FormattedServiceListItem` and `FormattedServiceMutation` include both fields

### Client Type Updates

- `client/src/types/service.ts` — `Service` interface: added optional `manifest_managed?: number` and `manifest_key?: string | null`
- `client/src/types/team.ts` — `TeamService` interface: added optional `manifest_managed?: number` and `manifest_key?: string | null`

### Services List Badge

**File:** `client/src/components/pages/Services/ServicesList.tsx`

`[M]` pill badge displayed next to manifest-managed service names in the services table. Only shown when `manifest_managed === 1`.

- CSS class `.manifestBadge` in `Services.module.css`
- Styling: `font-size: 0.625rem`, accent colors via `color-mix()`, `border-radius: 3px`, `title="Managed by manifest"`

### Team Detail Badge

**File:** `client/src/components/pages/Teams/TeamDetail.tsx`

Same `[M]` badge next to service names in the team detail services section. CSS class `.manifestBadge` in `Teams.module.css`.

### Service Edit Warning

**File:** `client/src/components/pages/Services/ServiceForm.tsx`

Warning banner shown at the top of the form when editing a manifest-managed service (not shown in create mode):

> "This service is managed by a manifest. Manual changes may be detected as drift on the next sync."

- Warning icon (triangle) + text in `.warningBanner` styled div
- CSS uses `var(--color-warning-bg)`, `var(--color-warning-border)`, `var(--color-warning-text)`
- Informational only — does not block editing

### Service Detail Page

**File:** `client/src/components/pages/Services/ServiceDetail.tsx`

Two manifest indicators on the service detail page:

1. `[M]` badge in the title row next to the health status badge
2. "Managed by manifest · Key: {manifest_key}" metadata item in the metadata card (only shown when `manifest_managed === 1`)

### Tests

- 2 tests in `services.test.ts` (server) — manifest fields in list and detail responses
- 2 tests in `ServicesList.test.tsx` — badge presence/absence for manifest-managed services
- 2 tests in `TeamDetail.test.tsx` — badge presence/absence in team services section
- 3 tests in `ServiceForm.test.tsx` — warning banner in edit mode (manifest/non-manifest/create)
- 3 tests in `ServiceDetail.test.tsx` — badge + manifest info with key, without key, and non-manifest

## ManifestStatusCard

**[Implemented]** (DPS-61)

### Component

**File:** `client/src/components/pages/Teams/ManifestStatusCard.tsx`

Compact status card on the team detail page showing manifest configuration status, last sync result, pending drift count, and quick actions.

**Props:** `teamId: string`, `canManage: boolean`

Fetches two lightweight endpoints on mount:
- `GET /api/teams/:id/manifest` — manifest config (via `useManifestConfig` hook)
- `GET /api/teams/:id/drifts/summary` — drift badge counts (via `getDriftSummary` API)

### States

| State | Trigger | Display |
|---|---|---|
| No manifest | `config` is null | "No manifest URL configured." + "Configure Manifest →" link (lead only) |
| Configured OK | Config present, enabled, no drift, no error | URL (truncated), last sync time + status + service count, Sync Now + Manage Manifest |
| Configured with drift | Config present + pending drift count > 0 | Same as OK plus warning banner: "N pending drift flags (M dismissed)" linking to manifest page |
| Last sync errored | `last_sync_status === 'failed'` | URL, red status dot, error message |
| Manifest disabled | `is_enabled === 0` | URL, "Scheduled syncs are paused", Manage Manifest only (no Sync Now) |

### Sync Now Behavior

- Button enters loading state ("Syncing...")
- Calls `POST /api/teams/:teamId/manifest/sync`
- On success: inline summary banner (e.g., "Added 2, updated 1, 3 drift flags"), auto-dismiss after 8s
- On error: inline error banner ("Sync failed")
- Refreshes config and drift summary after sync

### Placement

Inserted between Services section and Alert Channels section in `TeamDetail.tsx`. Uses `canManageAlerts` boolean for permission check (same team lead/admin check).

### Styling

**File:** `client/src/components/pages/Teams/ManifestStatusCard.module.css`

Uses shared `Teams.module.css` section classes (`.section`, `.sectionHeader`, `.sectionTitle`). Component-specific styles:
- `.manifestUrl` — monospace, truncated with ellipsis
- `.syncStatus` — status dot (green/yellow/red) + text
- `.driftAlert` — warning-colored banner linking to manifest page
- `.cardActions` — flex row with Sync Now button and Manage Manifest link
- `.syncResultBanner` — success (green) or error (red) banner with dismiss button

### Tests

22 tests in `ManifestStatusCard.test.tsx` covering:
- Loading state
- Empty state (no manifest configured)
- Configure Manifest link visibility (managers vs non-managers)
- URL display and truncation
- Sync status display (success, partial, error states)
- Service count from last sync summary
- Disabled manifest state (paused syncs, no Sync Now button)
- Drift alert with pending/dismissed counts (singular/plural)
- Sync Now trigger and API call verification
- Success summary banner with auto-dismiss (8s timer)
- Manual banner dismissal
- Sync error handling
- "No changes" result display
