# 4. API Reference

**[Implemented]** unless noted otherwise.

All endpoints are prefixed with `/api`. All responses are JSON. All mutating requests require the `X-CSRF-Token` header.

## 4.1 Health Check

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | None | Returns `{ status: "ok" }`. Exempt from HTTPS redirect. |

## 4.2 Authentication

Rate limited: 20 requests/minute per IP.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/login` | None | Initiates OIDC flow. Query: `returnTo` (optional). Redirects to OIDC provider. |
| GET | `/api/auth/callback` | None | OIDC callback. Exchanges code for tokens, creates/updates user, redirects to frontend. |
| POST | `/api/auth/logout` | requireAuth | Destroys session. Returns `{ redirectUrl: string }`. |
| GET | `/api/auth/me` | requireAuth | Returns current user profile with teams and permissions. |

**GET /api/auth/me response:**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "User Name",
  "role": "admin | user",
  "is_active": true,
  "teams": [
    {
      "team_id": "uuid",
      "role": "lead | member",
      "team": { "id": "uuid", "name": "Team Name", "description": "..." }
    }
  ],
  "permissions": {
    "canManageUsers": true,
    "canManageTeams": true,
    "canManageServices": true
  }
}
```

## 4.3 Services

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/services` | requireAuth | List services. Non-admin: scoped to user's teams. Query: `team_id` (optional filter, validated against membership). |
| GET | `/api/services/:id` | requireAuth | Get service with dependencies and dependent reports. Non-admin: requires team membership. |
| POST | `/api/services` | requireBodyTeamLead | Create service. |
| PUT | `/api/services/:id` | requireServiceTeamLead | Update service. |
| DELETE | `/api/services/:id` | requireServiceTeamLead | Delete service. Returns 204. |
| POST | `/api/services/:id/poll` | requireServiceTeamAccess | Trigger manual poll. Requires team membership (any role). |
| GET | `/api/services/:id/poll-history` | requireAuth | Get service-level poll error/recovery history. Returns last 50 entries with 24h error count. |
| POST | `/api/services/test-schema` | requireAuth (team lead+ or admin) | Test a schema mapping against a live URL. **[Implemented]** (PRO-104). |

**POST /api/services/test-schema request:** **[Implemented]** (PRO-104)

```json
{
  "url": "https://example.com/health (required, SSRF-validated)",
  "schema_config": "SchemaMapping object or JSON string (required)"
}
```

**POST /api/services/test-schema response:**

```json
{
  "success": true,
  "dependencies": [
    { "name": "database", "healthy": true, "latency_ms": 12, "impact": null, "description": null, "contact": null, "type": "other", "skipped": false }
  ],
  "warnings": ["No impact field mapping configured — impact data will not be captured"]
}
```

On parse failure: `{ success: false, dependencies: [], warnings: ["error message"] }`. 10-second fetch timeout. Does NOT store anything.

**POST /api/services request:**

```json
{
  "name": "string (required)",
  "team_id": "uuid (required)",
  "health_endpoint": "url (required, SSRF-validated)",
  "metrics_endpoint": "url (optional)",
  "schema_config": "SchemaMapping object or null (optional, see Section 12.5)",
  "poll_interval_ms": "number (optional, default 30000, min 5000, max 3600000)"
}
```

**GET /api/services/:id response:**

```json
{
  "id": "uuid",
  "name": "Payment Service",
  "team_id": "uuid",
  "team": { "id": "uuid", "name": "Platform", "description": "..." },
  "health_endpoint": "https://payment-svc/health",
  "metrics_endpoint": null,
  "schema_config": null,
  "poll_interval_ms": 30000,
  "is_active": 1,
  "last_poll_success": 1,
  "last_poll_error": null,
  "created_at": "2024-01-15T10:00:00.000Z",
  "dependencies": [
    {
      "id": "uuid",
      "name": "postgres-main",
      "canonical_name": "PostgreSQL Primary",
      "type": "database",
      "is_healthy": true,
      "latency_ms": 12,
      "error_message": null,
      "effective_contact": "{\"email\":\"db-team@example.com\",\"slack\":\"#db-support\"}",
      "effective_impact": "Critical — primary database"
    }
  ],
  "dependent_reports": [
    {
      "service_id": "uuid",
      "service_name": "API Gateway",
      "is_healthy": true,
      "dependency_name": "payment-service"
    }
  ]
}
```

**POST /api/services/:id/poll response:**

```json
{
  "success": true,
  "dependencies_updated": 3,
  "status_changes": 1,
  "latency_ms": 245,
  "error": null
}
```

## 4.4 Teams

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/teams` | requireAuth | List all teams with member/service counts. |
| GET | `/api/teams/:id` | requireAuth | Get team with members and services. |
| POST | `/api/teams` | requireAdmin | Create team. |
| PUT | `/api/teams/:id` | requireAdmin | Update team. |
| DELETE | `/api/teams/:id` | requireAdmin | Delete team. Returns 409 if team has services. |
| POST | `/api/teams/:id/members` | requireAdmin | Add member. Body: `{ user_id, role }`. |
| PUT | `/api/teams/:id/members/:userId` | requireAdmin | Update member role. Body: `{ role }`. |
| DELETE | `/api/teams/:id/members/:userId` | requireAdmin | Remove member. Returns 204. |

**Validation:**
- Team name must be unique (409 Conflict on duplicate)
- Cannot delete team with services (409 Conflict)
- Cannot add existing member (409 Conflict)

## 4.5 Users

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/users` | requireAdmin | List all users. |
| GET | `/api/users/:id` | requireAdmin | Get user with team memberships. |
| POST | `/api/users` | requireAdmin + requireLocalAuth | Create local user. Body: `{ email, name, password, role? }`. |
| PUT | `/api/users/:id/role` | requireAdmin | Update role. Body: `{ role: "admin" | "user" }`. |
| PUT | `/api/users/:id/password` | requireAdmin + requireLocalAuth | Reset password. Body: `{ password }`. |
| DELETE | `/api/users/:id` | requireAdmin | Deactivate user (soft delete). |
| POST | `/api/users/:id/reactivate` | requireAdmin | Reactivate deactivated user. |

**Guardrails:**
- Cannot demote the last admin (400)
- Cannot deactivate the last active admin (400)
- Deactivating a user removes them from all team memberships
- Create user and password reset return 404 when not in local auth mode
- Password must be at least 8 characters (400)
- Duplicate email returns 409

## 4.6 Aliases

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/aliases` | requireAuth | List all aliases. |
| POST | `/api/aliases` | requireAuth | Create alias. Body: `{ alias, canonical_name }`. |
| GET | `/api/aliases/canonical-names` | requireAuth | List distinct canonical names. |
| PUT | `/api/aliases/:id` | requireAuth | Update alias. Body: `{ canonical_name }`. |
| DELETE | `/api/aliases/:id` | requireAuth | Delete alias. Returns 204. |

**Note:** Alias read endpoints (`GET`) require `requireAuth`. Alias mutations (`POST`, `PUT`, `DELETE`) require `requireAdmin`. **[Implemented]** (PRO-92).

## 4.7 Associations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/dependencies/:depId/associations` | requireAuth | Get associations for dependency (non-dismissed). |
| POST | `/api/dependencies/:depId/associations` | requireAuth | Create manual association. Body: `{ linked_service_id, association_type }`. |
| DELETE | `/api/dependencies/:depId/associations/:serviceId` | requireAuth | Remove association. Returns 204. |
| POST | `/api/dependencies/:depId/suggestions/generate` | requireAuth | Generate suggestions for one dependency. |
| POST | `/api/services/:serviceId/suggestions/generate` | requireAuth | Generate suggestions for all dependencies of a service. |
| GET | `/api/associations/suggestions` | requireAuth | List pending (undismissed) suggestions. |
| POST | `/api/associations/suggestions/:id/accept` | requireAuth | Accept suggestion (converts to manual). |
| POST | `/api/associations/suggestions/:id/dismiss` | requireAuth | Dismiss suggestion. Returns 204. |

**Validation:**
- Cannot link dependency to its own owning service (400)
- Duplicate association returns 409 (unless reactivating a dismissed one)

## 4.8 Graph

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/graph` | requireAuth | Get dependency graph. Query: `team`, `service`, `dependency` (all optional). |

**Filtering logic (evaluated in order):**
1. If `dependency` specified → subgraph for that dependency
2. Else if `service` specified → service subgraph with upstream traversal
3. Else if `team` specified → team's services and their dependencies
4. Else → full graph of all active services

**Response:**

```json
{
  "nodes": [
    {
      "id": "uuid",
      "type": "service",
      "data": {
        "name": "Payment Service",
        "teamId": "uuid",
        "teamName": "Platform",
        "healthEndpoint": "https://...",
        "isActive": true,
        "dependencyCount": 3,
        "healthyCount": 2,
        "unhealthyCount": 1,
        "skippedCount": 0,
        "lastPollSuccess": true,
        "lastPollError": null,
        "serviceType": "rest",
        "isExternal": false
      }
    }
  ],
  "edges": [
    {
      "id": "sourceId-depId-type",
      "source": "provider-service-id",
      "target": "consumer-service-id",
      "data": {
        "relationship": "depends_on",
        "dependencyType": "database",
        "dependencyName": "postgres-main",
        "dependencyId": "uuid",
        "healthy": true,
        "latencyMs": 12,
        "avgLatencyMs24h": 15.3,
        "associationType": "database",
        "isAutoSuggested": false,
        "confidenceScore": null,
        "impact": "critical",
        "errorMessage": null,
        "skipped": false
      }
    }
  ]
}
```

## 4.9 History

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/latency/:dependencyId` | requireAuth | Latency stats and recent data points. |
| GET | `/api/latency/:dependencyId/buckets` | requireAuth | Time-bucketed latency data. Query: `range` (1h, 6h, 24h, 7d, 30d; default 24h). **[Implemented]** (PRO-86) |
| GET | `/api/errors/:dependencyId` | requireAuth | Error history with recovery events. |
| GET | `/api/dependencies/:id/timeline` | requireAuth | Health state timeline. Query: `range` (24h, 7d, 30d; default 24h). **[Implemented]** (PRO-86) |

**GET /api/latency/:dependencyId response:**

```json
{
  "dependencyId": "uuid",
  "currentLatencyMs": 12,
  "avgLatencyMs24h": 15.3,
  "minLatencyMs24h": 8,
  "maxLatencyMs24h": 42,
  "dataPointCount": 2880,
  "dataPoints": [
    { "recorded_at": "2024-01-15T10:00:00.000Z", "latency_ms": 12 }
  ]
}
```

Stats are for the last 24 hours. Data points limited to the last 100 records.

**GET /api/errors/:dependencyId response:**

```json
{
  "dependencyId": "uuid",
  "errorCount": 5,
  "errors": [
    {
      "error": { "code": "ECONNREFUSED" },
      "errorMessage": "Connection refused",
      "recordedAt": "2024-01-15T10:00:00.000Z",
      "isRecovery": false
    }
  ]
}
```

Errors are for the last 24 hours, limited to the last 50 records. `isRecovery: true` indicates a recovery event (both `error` and `errorMessage` are null).

**GET /api/latency/:dependencyId/buckets response:** **[Implemented]** (PRO-86)

```json
{
  "dependencyId": "uuid",
  "range": "24h",
  "buckets": [
    { "timestamp": "2024-01-15T10:00:00.000Z", "min": 8, "avg": 15, "max": 42, "count": 12 }
  ]
}
```

Bucket intervals: 1h/6h → 1-minute, 24h → 15-minute, 7d → 1-hour, 30d → 6-hour. Data is aggregated using SQLite `strftime` for efficient server-side bucketing. Returns 400 for invalid range values.

**GET /api/dependencies/:id/timeline response:** **[Implemented]** (PRO-86)

```json
{
  "dependencyId": "uuid",
  "range": "24h",
  "currentState": "healthy",
  "transitions": [
    { "timestamp": "2024-01-15T09:00:00.000Z", "state": "unhealthy" },
    { "timestamp": "2024-01-15T09:05:00.000Z", "state": "healthy" }
  ]
}
```

Transitions derived from `dependency_error_history`: error entries map to `"unhealthy"`, recovery entries (null error) map to `"healthy"`. `currentState` reflects the dependency's current `healthy` column (`"healthy"`, `"unhealthy"`, or `"unknown"` when null). Returns 400 for invalid range values.

## 4.10 Admin

**[Implemented]**

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/audit-log` | requireAdmin | Paginated audit log. Query: `limit`, `offset`, `startDate`, `endDate`, `userId`, `action`, `resourceType`. |
| GET | `/api/admin/settings` | requireAdmin | Returns all settings with current values and source (`database` or `default`). |
| PUT | `/api/admin/settings` | requireAdmin | Update settings. Body: partial object of `{ key: value }` pairs. Validates values before persisting. |

**GET /api/admin/audit-log response:**

```json
{
  "entries": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "action": "user.role_changed",
      "resource_type": "user",
      "resource_id": "uuid",
      "details": "{\"previousRole\":\"user\",\"newRole\":\"admin\"}",
      "ip_address": "127.0.0.1",
      "created_at": "2024-01-15T10:00:00.000Z",
      "user_email": "admin@example.com",
      "user_name": "Admin User"
    }
  ],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

**Audit actions:** `user.role_changed`, `user.deactivated`, `user.reactivated`, `team.created`, `team.updated`, `team.deleted`, `team.member_added`, `team.member_removed`, `team.member_role_changed`, `service.created`, `service.updated`, `service.deleted`, `settings.updated`

## 4.11 Alerts

**[Implemented]** (PRO-106)

Team-scoped alert channel, rule, and history management. All endpoints are nested under `/api/teams/:id`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/teams/:id/alert-channels` | requireTeamAccess | List alert channels for team. |
| POST | `/api/teams/:id/alert-channels` | requireTeamLead | Create alert channel. Body: `{ channel_type, config }`. |
| PUT | `/api/teams/:id/alert-channels/:channelId` | requireTeamLead | Update alert channel. Body: `{ channel_type?, config?, is_active? }`. |
| DELETE | `/api/teams/:id/alert-channels/:channelId` | requireTeamLead | Delete alert channel. Returns 204. |
| POST | `/api/teams/:id/alert-channels/:channelId/test` | requireTeamLead | Send test alert to channel. Returns `{ success, error }`. |
| GET | `/api/teams/:id/alert-rules` | requireTeamAccess | Get alert rules for team. |
| PUT | `/api/teams/:id/alert-rules` | requireTeamLead | Upsert alert rule. Body: `{ severity_filter, is_active? }`. |
| GET | `/api/teams/:id/alert-history` | requireTeamAccess | Paginated alert history. Query: `limit`, `offset`, `status`. |

**POST /api/teams/:id/alert-channels request (Slack):**

```json
{
  "channel_type": "slack",
  "config": {
    "webhook_url": "https://hooks.slack.com/services/T00/B00/xxx"
  }
}
```

**POST /api/teams/:id/alert-channels request (Webhook):**

```json
{
  "channel_type": "webhook",
  "config": {
    "url": "https://example.com/webhook",
    "headers": { "Authorization": "Bearer token" }
  }
}
```

**PUT /api/teams/:id/alert-rules request:**

```json
{
  "severity_filter": "critical | warning | all",
  "is_active": true
}
```

**Validation:**
- Slack webhook URL must match `https://hooks.slack.com/services/...`
- Webhook URL must be a valid URL
- Webhook headers must have string values
- `severity_filter` must be `critical`, `warning`, or `all`
- Channel updates verify the channel belongs to the specified team (404 otherwise)

## 4.12 Canonical Overrides

**[Implemented]** (DPS-14b)

Manage canonical-level dependency overrides that apply as defaults across all services reporting the same dependency. Merge hierarchy: instance override > canonical override > polled data.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/canonical-overrides` | requireAuth | List all canonical overrides. |
| GET | `/api/canonical-overrides/:canonicalName` | requireAuth | Get override by canonical name. Returns 404 if not found. |
| PUT | `/api/canonical-overrides/:canonicalName` | requireAuth + custom | Upsert override. Creates or updates. |
| DELETE | `/api/canonical-overrides/:canonicalName` | requireAuth + custom | Delete override. Returns 204. |

**Permissions (mutations):** Admin OR team lead of any team that owns a service with a dependency matching the given canonical name. Checked via `AuthorizationService.checkCanonicalOverrideAccess()`.

**PUT /api/canonical-overrides/:canonicalName request:**

```json
{
  "contact_override": { "email": "db-team@example.com", "slack": "#db-support" },
  "impact_override": "Critical — all downstream services depend on this"
}
```

- `contact_override`: object or `null` (setting to `null` clears the override). Stored as JSON string.
- `impact_override`: string or `null` (setting to `null` clears the override). Stored as plain text.
- At least one field must be provided (400 otherwise).

**PUT /api/canonical-overrides/:canonicalName response:**

```json
{
  "id": "uuid",
  "canonical_name": "PostgreSQL",
  "contact_override": "{\"email\":\"db-team@example.com\",\"slack\":\"#db-support\"}",
  "impact_override": "Critical — all downstream services depend on this",
  "created_at": "2026-02-24T10:00:00.000Z",
  "updated_at": "2026-02-24T10:00:00.000Z",
  "updated_by": "user-uuid"
}
```

**Audit actions:** `canonical_override.upserted`, `canonical_override.deleted` (resource type: `canonical_override`).

## 4.13 Per-Instance Dependency Overrides

**[Implemented]** (DPS-15b)

Per-instance overrides set contact and/or impact for a specific dependency instance (service-dependency pair). These take highest precedence in the merge hierarchy: instance override > canonical override > polled data.

| Method | Path | Auth | Description |
|---|---|---|---|
| PUT | `/api/dependencies/:id/overrides` | requireAuth + custom | Set per-instance overrides. |
| DELETE | `/api/dependencies/:id/overrides` | requireAuth + custom | Clear all per-instance overrides. Returns 204. |

**Permissions:** Admin OR team lead of the team that owns the service reporting this dependency. Checked via `AuthorizationService.checkDependencyTeamLeadAccess()`.

**PUT /api/dependencies/:id/overrides request:**

```json
{
  "contact_override": { "email": "db-team@example.com", "slack": "#db-support" },
  "impact_override": "Critical — primary database"
}
```

- `contact_override`: object or `null` (setting to `null` clears). Stored as JSON string. Optional.
- `impact_override`: string or `null` (setting to `null` clears). Stored as plain text. Optional.
- At least one field must be provided (400 otherwise).

**PUT /api/dependencies/:id/overrides response:** Returns the full updated dependency row.

**DELETE /api/dependencies/:id/overrides:** Clears both `contact_override` and `impact_override` to null. Returns 204. Does not modify polled data columns.

**Audit actions:** `dependency_override.updated`, `dependency_override.cleared` (resource type: `dependency`).

## 4.14 Activity

**[Implemented]**

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/activity/recent` | requireAuth | Recent status change events. Query: `limit` (optional, default 10, max 50). |
| GET | `/api/activity/unstable` | requireAuth | Most unstable dependencies. Query: `hours` (default 24, max 168), `limit` (default 5, max 20). |

**GET /api/activity/recent response:**

```json
[
  {
    "id": "uuid",
    "service_id": "uuid",
    "service_name": "Payment Service",
    "dependency_name": "postgres-main",
    "previous_healthy": true,
    "current_healthy": false,
    "recorded_at": "2024-06-01T12:00:00.000Z"
  }
]
```

`previous_healthy` is `null` for newly discovered dependencies. Events are sorted by `recorded_at` descending (most recent first). Subject to data retention cleanup.

**GET /api/activity/unstable response:**

```json
[
  {
    "dependency_name": "postgres-main",
    "service_name": "Payment Service",
    "service_id": "uuid",
    "change_count": 7,
    "current_healthy": false,
    "last_change_at": "2024-06-01T12:00:00.000Z"
  }
]
```

Returns dependencies with the most status changes within the specified time window, sorted by `change_count` descending. Used by the dashboard "Most Unstable" panel. When multiple services report on the same dependency name, the service from the most recent event is returned.

## 4.15 Wallboard

**[Implemented]** (PRO-48, DPS-16c)

Read-only aggregated view of all tracked dependencies, grouped by canonical name or linked service. Suitable for shared monitors and rapid triage.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/wallboard` | requireAuth | Get aggregated dependency wallboard. Non-admin: scoped to user's teams. |

**GET /api/wallboard response:**

```json
{
  "dependencies": [
    {
      "canonical_name": "PostgreSQL Primary",
      "primary_dependency_id": "uuid",
      "health_status": "healthy | warning | critical | unknown | skipped",
      "type": "database",
      "latency": { "min": 10, "avg": 25, "max": 42 },
      "last_checked": "2026-02-24T12:00:00.000Z",
      "error_message": null,
      "impact": "Critical — primary database",
      "description": "Main PostgreSQL cluster",
      "effective_contact": "{\"email\":\"db-team@example.com\",\"slack\":\"#db-support\"}",
      "effective_impact": "Critical — primary database",
      "linked_service": { "id": "uuid", "name": "PostgreSQL Service" },
      "reporters": [
        {
          "dependency_id": "uuid",
          "service_id": "uuid",
          "service_name": "Payment Service",
          "service_team_id": "uuid",
          "service_team_name": "Platform",
          "healthy": 1,
          "health_state": 0,
          "latency_ms": 25,
          "last_checked": "2026-02-24T12:00:00.000Z",
          "skipped": 0
        }
      ],
      "team_ids": ["uuid"]
    }
  ],
  "teams": [
    { "id": "uuid", "name": "Platform" }
  ]
}
```

**Aggregation rules:**
- Dependencies are grouped by linked service ID (if associated) or normalized canonical name / raw name
- `health_status`: worst status across all reporters (critical > warning > healthy > unknown). If all reporters for a group are skipped, the group status is `skipped`.
- `latency`: min/avg/max across all reporters with latency data (null if none)
- `impact`, `error_message`, `description`: from primary dependency (most recently checked), with first-non-null fallback across group
- `effective_contact`, `effective_impact`: resolved from the primary dependency's 3-tier override hierarchy (instance > canonical > polled). Contact uses field-level merge; impact uses first-non-null precedence.
- `type`: most common type across reporters
- Sorted by health status (worst first), then alphabetically
