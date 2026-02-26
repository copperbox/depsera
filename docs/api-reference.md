# Depsera API Reference

All endpoints are prefixed with `/api`. All responses are JSON (`Content-Type: application/json`).

Mutating requests (`POST`, `PUT`, `DELETE`) require the `X-CSRF-Token` header. The token value is read from the `csrf-token` cookie, which is set by the server on the first response.

## Authentication

Most endpoints require a valid session. Authenticate via OIDC login flow or local auth (`POST /api/auth/login`). The session is stored in a cookie (`deps-dashboard.sid`).

**Common error responses:**

| Status | Meaning |
|--------|---------|
| `401` | Not authenticated — session missing or expired |
| `403` | Forbidden — insufficient role or CSRF token missing/invalid |
| `404` | Resource not found |
| `409` | Conflict — duplicate resource |
| `429` | Rate limited — retry after the `Retry-After` header value |

---

## Health Check

### `GET /api/health`

Returns server health status. No authentication required. Exempt from HTTPS redirect and rate limiting.

```bash
curl http://localhost:3001/api/health
```

```json
{ "status": "ok" }
```

---

## Auth

Rate limited: 20 requests/minute per IP on all `/api/auth` endpoints.

### `GET /api/auth/mode`

Returns the current authentication mode. No authentication required.

```bash
curl http://localhost:3001/api/auth/mode
```

```json
{ "mode": "local" }
```

`mode` is either `"oidc"` or `"local"`.

---

### `GET /api/auth/login`

Initiates the OIDC login flow. Redirects the browser to the OIDC provider. Only used in OIDC mode.

| Query Param | Type | Description |
|-------------|------|-------------|
| `returnTo` | string | Optional. URL to redirect to after login (default: `/`) |

```bash
# Browser redirect — not typically called via curl
curl -v "http://localhost:3001/api/auth/login?returnTo=/services"
```

Returns `302` redirect to the OIDC provider's authorization endpoint.

---

### `GET /api/auth/callback`

OIDC callback endpoint. Exchanges the authorization code for tokens, creates or updates the user, and redirects to the frontend. Not called directly by clients.

---

### `POST /api/auth/login`

Local auth login. Only available when `LOCAL_AUTH=true`.

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email": "admin@example.com", "password": "changeme123"}'
```

**Request body:**

```json
{
  "email": "string (required)",
  "password": "string (required)"
}
```

**Success response (200):**

```json
{
  "id": "uuid",
  "email": "admin@example.com",
  "name": "Admin User",
  "role": "admin"
}
```

**Error responses:**

| Status | Body |
|--------|------|
| `401` | `{ "error": "Invalid email or password" }` |
| `404` | Returned when not in local auth mode |

---

### `POST /api/auth/logout`

Destroys the session and returns a redirect URL. Requires authentication.

```bash
curl -X POST http://localhost:3001/api/auth/logout \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response (200):**

```json
{ "redirectUrl": "/login" }
```

In OIDC mode, `redirectUrl` may point to the OIDC provider's end-session endpoint.

---

### `GET /api/auth/me`

Returns the current user's profile, team memberships, and permissions. Requires authentication.

```bash
curl http://localhost:3001/api/auth/me -b cookies.txt
```

**Response (200):**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "User Name",
  "role": "admin",
  "is_active": true,
  "teams": [
    {
      "team_id": "uuid",
      "role": "lead",
      "team": { "id": "uuid", "name": "Platform", "description": "Platform team" }
    }
  ],
  "permissions": {
    "canManageUsers": true,
    "canManageTeams": true,
    "canManageServices": true
  }
}
```

---

## Services

### `GET /api/services`

List services. Non-admin users see only services belonging to their teams. Admin users see all services.

| Query Param | Type | Description |
|-------------|------|-------------|
| `team_id` | uuid | Optional. Filter by team (validated against membership for non-admins) |

```bash
curl http://localhost:3001/api/services -b cookies.txt
```

**Response (200):** Array of service objects.

```json
[
  {
    "id": "uuid",
    "name": "Payment Service",
    "team_id": "uuid",
    "team_name": "Platform",
    "health_endpoint": "https://payment-svc/health",
    "metrics_endpoint": null,
    "schema_config": null,
    "poll_interval_ms": 30000,
    "is_active": 1,
    "last_poll_success": 1,
    "last_poll_error": null,
    "dependency_count": 3,
    "healthy_count": 2,
    "unhealthy_count": 1,
    "created_at": "2024-01-15T10:00:00.000Z"
  }
]
```

---

### `GET /api/services/:id`

Get a single service with its dependencies and dependent reports. Non-admin users must be a member of the service's owning team.

```bash
curl http://localhost:3001/api/services/<service-id> -b cookies.txt
```

**Response (200):**

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

---

### `POST /api/services`

Create a new service. Requires team lead role on the specified team, or admin.

```bash
curl -X POST http://localhost:3001/api/services \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{
    "name": "Payment Service",
    "team_id": "<team-uuid>",
    "health_endpoint": "https://payment-svc/health",
    "poll_interval_ms": 30000
  }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Service name |
| `team_id` | uuid | Yes | Owning team ID |
| `health_endpoint` | url | Yes | Health check URL (SSRF-validated) |
| `metrics_endpoint` | url | No | Metrics URL |
| `schema_config` | object | No | Custom schema mapping (see [Health Endpoint Spec](./health-endpoint-spec.md)) |
| `poll_interval_ms` | number | No | Poll interval in ms (default: 30000, min: 5000, max: 3600000) |

**Response (201):** The created service object.

**Error responses:**

| Status | Reason |
|--------|--------|
| `400` | Validation error (invalid URL, poll interval out of range, etc.) |
| `403` | Not a team lead of the specified team |

---

### `PUT /api/services/:id`

Update a service. Requires team lead role on the service's owning team, or admin.

```bash
curl -X PUT http://localhost:3001/api/services/<service-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "name": "Payment Service v2", "poll_interval_ms": 60000 }'
```

**Request body:** Same fields as create (all optional for updates).

**Response (200):** The updated service object.

---

### `DELETE /api/services/:id`

Delete a service. Requires team lead role on the service's owning team, or admin.

```bash
curl -X DELETE http://localhost:3001/api/services/<service-id> \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response:** `204 No Content`

---

### `POST /api/services/:id/poll`

Trigger an immediate health poll for a service. Requires team membership (any role) on the service's owning team, or admin.

```bash
curl -X POST http://localhost:3001/api/services/<service-id>/poll \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response (200):**

```json
{
  "success": true,
  "dependencies_updated": 3,
  "status_changes": 1,
  "latency_ms": 245,
  "error": null
}
```

---

### `POST /api/services/test-schema`

Test a schema mapping against a live health endpoint URL. Does not store anything. SSRF-protected.

Requires authentication and team lead role on any team, or admin.

```bash
curl -X POST http://localhost:3001/api/services/test-schema \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{
    "url": "https://example.com/health",
    "schema_config": {
      "root": "checks",
      "fields": {
        "name": "name",
        "healthy": { "path": "status", "equals": "UP" },
        "latency": "responseTime"
      }
    }
  }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | url | Yes | Health endpoint URL to test (SSRF-validated) |
| `schema_config` | object/string | Yes | Schema mapping config (object or JSON string) |

**Response (200):**

```json
{
  "success": true,
  "dependencies": [
    { "name": "database", "healthy": true, "latency_ms": 12, "impact": null, "description": null, "contact": null, "type": "other" }
  ],
  "warnings": ["No impact field mapping configured — impact data will not be captured"]
}
```

On parse failure: `{ "success": false, "dependencies": [], "warnings": ["error message"] }`.

---

## External Services

External services are lightweight entries (name + description, no health endpoint) representing services outside Depsera's monitoring scope. They can be used as association targets for dependencies.

### `GET /api/external-services`

List external services. Non-admin users see only external services belonging to their teams. Admin users see all.

| Query Param | Type | Description |
|-------------|------|-------------|
| `team_id` | uuid | Optional. Filter by team |

```bash
curl http://localhost:3001/api/external-services -b cookies.txt
```

**Response (200):** Array of external service objects.

```json
[
  {
    "id": "uuid",
    "name": "Payment Gateway",
    "team_id": "uuid",
    "description": "Stripe integration",
    "is_external": 1,
    "team": { "id": "uuid", "name": "Platform" },
    "created_at": "2024-01-15T10:00:00.000Z",
    "updated_at": "2024-01-15T10:00:00.000Z"
  }
]
```

---

### `POST /api/external-services`

Create an external service. Requires team lead role on the specified team, or admin.

```bash
curl -X POST http://localhost:3001/api/external-services \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "name": "Payment Gateway", "team_id": "<team-uuid>", "description": "Stripe integration" }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | External service name |
| `team_id` | uuid | Yes | Owning team ID |
| `description` | string | No | Description of the external service |

**Response (201):** The created external service object.

**Error responses:**

| Status | Reason |
|--------|--------|
| `400` | Validation error (missing name, invalid team) |
| `403` | Not a team lead of the specified team |

---

### `PUT /api/external-services/:id`

Update an external service. Requires team lead role on the service's owning team, or admin.

```bash
curl -X PUT http://localhost:3001/api/external-services/<service-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "name": "Updated Name", "description": "Updated description" }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Updated name |
| `description` | string/null | No | Updated description (null to clear) |

**Response (200):** The updated external service object.

**Error responses:**

| Status | Reason |
|--------|--------|
| `400` | Empty name or no changes provided |
| `404` | External service not found |

---

### `DELETE /api/external-services/:id`

Delete an external service. Cascades to associated `dependency_associations`. Requires team lead role on the service's owning team, or admin.

```bash
curl -X DELETE http://localhost:3001/api/external-services/<service-id> \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response:** `204 No Content`

**Error responses:**

| Status | Reason |
|--------|--------|
| `404` | External service not found |

---

## Teams

### `GET /api/teams`

List all teams with member and service counts. Requires authentication.

```bash
curl http://localhost:3001/api/teams -b cookies.txt
```

**Response (200):** Array of team objects with counts.

```json
[
  {
    "id": "uuid",
    "name": "Platform",
    "description": "Platform infrastructure team",
    "member_count": 5,
    "service_count": 3,
    "created_at": "2024-01-10T08:00:00.000Z"
  }
]
```

---

### `GET /api/teams/:id`

Get team details with members and services. Requires authentication.

```bash
curl http://localhost:3001/api/teams/<team-id> -b cookies.txt
```

**Response (200):**

```json
{
  "id": "uuid",
  "name": "Platform",
  "description": "Platform infrastructure team",
  "created_at": "2024-01-10T08:00:00.000Z",
  "members": [
    {
      "user_id": "uuid",
      "role": "lead",
      "user": { "id": "uuid", "email": "lead@example.com", "name": "Team Lead", "role": "user" }
    }
  ],
  "services": [
    { "id": "uuid", "name": "Payment Service", "is_active": 1 }
  ]
}
```

---

### `POST /api/teams`

Create a new team. Requires admin role.

```bash
curl -X POST http://localhost:3001/api/teams \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "name": "Platform", "description": "Platform infrastructure team" }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Team name (must be unique) |
| `description` | string | No | Team description |

**Response (201):** The created team object.

**Error responses:**

| Status | Reason |
|--------|--------|
| `409` | Team name already exists |

---

### `PUT /api/teams/:id`

Update a team. Requires admin role.

```bash
curl -X PUT http://localhost:3001/api/teams/<team-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "description": "Updated description" }'
```

**Response (200):** The updated team object.

---

### `DELETE /api/teams/:id`

Delete a team. Requires admin role. Fails if the team has services.

```bash
curl -X DELETE http://localhost:3001/api/teams/<team-id> \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response:** `204 No Content`

**Error responses:**

| Status | Reason |
|--------|--------|
| `409` | Team has services — delete or reassign them first |

---

### `POST /api/teams/:id/members`

Add a member to a team. Requires admin role.

```bash
curl -X POST http://localhost:3001/api/teams/<team-id>/members \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "user_id": "<user-uuid>", "role": "member" }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | uuid | Yes | User to add |
| `role` | string | Yes | `"lead"` or `"member"` |

**Response (201):** The team membership object.

**Error responses:**

| Status | Reason |
|--------|--------|
| `409` | User is already a member of this team |

---

### `PUT /api/teams/:id/members/:userId`

Update a team member's role. Requires admin role.

```bash
curl -X PUT http://localhost:3001/api/teams/<team-id>/members/<user-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "role": "lead" }'
```

**Response (200):** The updated membership object.

---

### `DELETE /api/teams/:id/members/:userId`

Remove a member from a team. Requires admin role.

```bash
curl -X DELETE http://localhost:3001/api/teams/<team-id>/members/<user-id> \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response:** `204 No Content`

---

## Users

All user management endpoints require admin role unless noted.

### `GET /api/users`

List all users.

```bash
curl http://localhost:3001/api/users -b cookies.txt
```

**Response (200):** Array of user objects.

```json
[
  {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "user",
    "is_active": true,
    "created_at": "2024-01-10T08:00:00.000Z"
  }
]
```

---

### `GET /api/users/:id`

Get user details with team memberships.

```bash
curl http://localhost:3001/api/users/<user-id> -b cookies.txt
```

**Response (200):**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "User Name",
  "role": "user",
  "is_active": true,
  "created_at": "2024-01-10T08:00:00.000Z",
  "teams": [
    { "team_id": "uuid", "role": "lead", "team_name": "Platform" }
  ]
}
```

---

### `POST /api/users`

Create a local user. Only available when `LOCAL_AUTH=true`. Requires admin role.

```bash
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "email": "new@example.com", "name": "New User", "password": "securepassword", "role": "user" }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | User email (must be unique) |
| `name` | string | Yes | Display name |
| `password` | string | Yes | Password (min 8 characters) |
| `role` | string | No | `"admin"` or `"user"` (default: `"user"`) |

**Error responses:**

| Status | Reason |
|--------|--------|
| `400` | Password too short or missing required fields |
| `404` | Not in local auth mode |
| `409` | Email already exists |

---

### `PUT /api/users/:id/role`

Update a user's role.

```bash
curl -X PUT http://localhost:3001/api/users/<user-id>/role \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "role": "admin" }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | string | Yes | `"admin"` or `"user"` |

**Error responses:**

| Status | Reason |
|--------|--------|
| `400` | Cannot demote the last admin |

---

### `PUT /api/users/:id/password`

Reset a user's password. Only available when `LOCAL_AUTH=true`. Requires admin role.

```bash
curl -X PUT http://localhost:3001/api/users/<user-id>/password \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "password": "newsecurepassword" }'
```

**Error responses:**

| Status | Reason |
|--------|--------|
| `400` | Password too short |
| `404` | Not in local auth mode |

---

### `DELETE /api/users/:id`

Deactivate a user (soft delete). Removes user from all team memberships.

```bash
curl -X DELETE http://localhost:3001/api/users/<user-id> \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Error responses:**

| Status | Reason |
|--------|--------|
| `400` | Cannot deactivate the last active admin |

---

### `POST /api/users/:id/reactivate`

Reactivate a previously deactivated user.

```bash
curl -X POST http://localhost:3001/api/users/<user-id>/reactivate \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

---

## Aliases

Read endpoints require authentication. Mutation endpoints (`POST`, `PUT`, `DELETE`) require admin role.

### `GET /api/aliases`

List all dependency aliases.

```bash
curl http://localhost:3001/api/aliases -b cookies.txt
```

**Response (200):**

```json
[
  {
    "id": "uuid",
    "alias": "pg-main",
    "canonical_name": "PostgreSQL Primary",
    "created_at": "2024-01-15T10:00:00.000Z"
  }
]
```

---

### `GET /api/aliases/canonical-names`

List distinct canonical names across all aliases.

```bash
curl http://localhost:3001/api/aliases/canonical-names -b cookies.txt
```

**Response (200):**

```json
["PostgreSQL Primary", "Redis Cache", "RabbitMQ"]
```

---

### `POST /api/aliases`

Create a new alias mapping. Requires admin role.

```bash
curl -X POST http://localhost:3001/api/aliases \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "alias": "pg-main", "canonical_name": "PostgreSQL Primary" }'
```

---

### `PUT /api/aliases/:id`

Update an alias's canonical name. Requires admin role.

```bash
curl -X PUT http://localhost:3001/api/aliases/<alias-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "canonical_name": "PostgreSQL Primary DB" }'
```

---

### `DELETE /api/aliases/:id`

Delete an alias. Requires admin role.

```bash
curl -X DELETE http://localhost:3001/api/aliases/<alias-id> \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response:** `204 No Content`

---

## Associations

Association mutations require team membership on the dependency's owning team.

### `GET /api/dependencies/:dependencyId/associations`

Get associations for a dependency (non-dismissed only).

```bash
curl http://localhost:3001/api/dependencies/<dep-id>/associations -b cookies.txt
```

---

### `POST /api/dependencies/:dependencyId/associations`

Create a manual association between a dependency and a service.

```bash
curl -X POST http://localhost:3001/api/dependencies/<dep-id>/associations \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "linked_service_id": "<service-uuid>", "association_type": "database" }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `linked_service_id` | uuid | Yes | Target service ID |
| `association_type` | string | Yes | Type of association (e.g., `database`, `api`, `cache`) |

**Error responses:**

| Status | Reason |
|--------|--------|
| `400` | Cannot link a dependency to its own owning service |
| `409` | Association already exists |

---

### `DELETE /api/dependencies/:dependencyId/associations/:serviceId`

Remove an association.

```bash
curl -X DELETE http://localhost:3001/api/dependencies/<dep-id>/associations/<service-id> \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response:** `204 No Content`

---

### `POST /api/dependencies/:dependencyId/suggestions/generate`

Generate association suggestions for a single dependency.

```bash
curl -X POST http://localhost:3001/api/dependencies/<dep-id>/suggestions/generate \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

---

### `POST /api/services/:serviceId/suggestions/generate`

Generate association suggestions for all dependencies of a service.

```bash
curl -X POST http://localhost:3001/api/services/<service-id>/suggestions/generate \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

---

### `GET /api/associations/suggestions`

List all pending (undismissed) suggestions.

```bash
curl http://localhost:3001/api/associations/suggestions -b cookies.txt
```

---

### `POST /api/associations/suggestions/:id/accept`

Accept a suggestion, converting it to a manual association.

```bash
curl -X POST http://localhost:3001/api/associations/suggestions/<suggestion-id>/accept \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

---

### `POST /api/associations/suggestions/:id/dismiss`

Dismiss a suggestion.

```bash
curl -X POST http://localhost:3001/api/associations/suggestions/<suggestion-id>/dismiss \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response:** `204 No Content`

---

## Graph

### `GET /api/graph`

Get the dependency graph data for rendering. Returns nodes (services + external dependencies) and edges (dependency relationships).

| Query Param | Type | Description |
|-------------|------|-------------|
| `dependency` | uuid | Show subgraph for a specific dependency |
| `service` | uuid | Show subgraph for a specific service (with upstream traversal) |
| `team` | uuid | Show graph for a specific team's services |

Filters are evaluated in priority order: `dependency` > `service` > `team`. If no filters are provided, the full org-wide graph is returned.

```bash
# Full graph
curl http://localhost:3001/api/graph -b cookies.txt

# Team-filtered graph
curl "http://localhost:3001/api/graph?team=<team-id>" -b cookies.txt
```

**Response (200):**

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
        "errorMessage": null
      }
    }
  ]
}
```

---

## History

### `GET /api/latency/:dependencyId`

Get latency statistics and recent data points for a dependency (last 24 hours).

```bash
curl http://localhost:3001/api/latency/<dep-id> -b cookies.txt
```

**Response (200):**

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

Data points are limited to the last 100 records.

---

### `GET /api/latency/:dependencyId/buckets`

Get time-bucketed latency data for chart rendering.

| Query Param | Type | Description |
|-------------|------|-------------|
| `range` | string | Time range: `1h`, `6h`, `24h` (default), `7d`, `30d` |

Bucket intervals: `1h`/`6h` → 1-minute buckets, `24h` → 15-minute, `7d` → 1-hour, `30d` → 6-hour.

```bash
curl "http://localhost:3001/api/latency/<dep-id>/buckets?range=7d" -b cookies.txt
```

**Response (200):**

```json
{
  "dependencyId": "uuid",
  "range": "7d",
  "buckets": [
    { "timestamp": "2024-01-15T10:00:00.000Z", "min": 8, "avg": 15, "max": 42, "count": 12 }
  ]
}
```

---

### `GET /api/errors/:dependencyId`

Get error history for a dependency (last 24 hours, up to 50 records).

```bash
curl http://localhost:3001/api/errors/<dep-id> -b cookies.txt
```

**Response (200):**

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

`isRecovery: true` indicates a recovery event — `error` and `errorMessage` are null.

---

### `GET /api/dependencies/:id/timeline`

Get health state timeline showing transitions between healthy and unhealthy states.

| Query Param | Type | Description |
|-------------|------|-------------|
| `range` | string | Time range: `24h` (default), `7d`, `30d` |

```bash
curl "http://localhost:3001/api/dependencies/<dep-id>/timeline?range=7d" -b cookies.txt
```

**Response (200):**

```json
{
  "dependencyId": "uuid",
  "range": "7d",
  "currentState": "healthy",
  "transitions": [
    { "timestamp": "2024-01-15T09:00:00.000Z", "state": "unhealthy" },
    { "timestamp": "2024-01-15T09:05:00.000Z", "state": "healthy" }
  ]
}
```

`currentState` is `"healthy"`, `"unhealthy"`, or `"unknown"` (when no health data exists).

---

## Admin

All admin endpoints require admin role.

### `GET /api/admin/audit-log`

Query the audit log with optional filters.

| Query Param | Type | Description |
|-------------|------|-------------|
| `limit` | number | Max results (default: 50) |
| `offset` | number | Pagination offset |
| `startDate` | ISO date | Filter entries after this date |
| `endDate` | ISO date | Filter entries before this date |
| `userId` | uuid | Filter by acting user |
| `action` | string | Filter by action type |
| `resourceType` | string | Filter by resource type |

```bash
curl "http://localhost:3001/api/admin/audit-log?limit=20&action=user.role_changed" -b cookies.txt
```

**Response (200):**

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
  "limit": 20,
  "offset": 0
}
```

**Audit action types:** `user.role_changed`, `user.deactivated`, `user.reactivated`, `team.created`, `team.updated`, `team.deleted`, `team.member_added`, `team.member_removed`, `team.member_role_changed`, `service.created`, `service.updated`, `service.deleted`, `external_service.created`, `external_service.updated`, `external_service.deleted`, `settings.updated`, `canonical_override.upserted`, `canonical_override.deleted`, `dependency_override.updated`, `dependency_override.cleared`

---

### `GET /api/admin/settings`

Get all admin-configurable settings with current values and source.

```bash
curl http://localhost:3001/api/admin/settings -b cookies.txt
```

**Response (200):**

```json
{
  "data_retention_days": { "value": 365, "source": "default" },
  "retention_cleanup_time": { "value": "02:00", "source": "default" },
  "default_poll_interval_ms": { "value": 30000, "source": "default" },
  "ssrf_allowlist": { "value": "localhost,127.0.0.0/8", "source": "database" },
  "global_rate_limit": { "value": 3000, "source": "default" },
  "global_rate_limit_window_minutes": { "value": 1, "source": "default" },
  "auth_rate_limit": { "value": 20, "source": "default" },
  "auth_rate_limit_window_minutes": { "value": 1, "source": "default" },
  "alert_cooldown_minutes": { "value": 5, "source": "default" },
  "alert_rate_limit_per_hour": { "value": 30, "source": "default" }
}
```

`source` is `"database"` (admin-configured) or `"default"` (env var or built-in default).

---

### `PUT /api/admin/settings`

Update admin settings. Accepts a partial object of key-value pairs.

```bash
curl -X PUT http://localhost:3001/api/admin/settings \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "data_retention_days": 180, "alert_cooldown_minutes": 10 }'
```

**Response (200):** The full updated settings object (same shape as GET).

---

## Alerts

Team-scoped alert management. All endpoints are nested under `/api/teams/:id`.

### `GET /api/teams/:id/alert-channels`

List alert channels for a team. Requires team membership (any role).

```bash
curl http://localhost:3001/api/teams/<team-id>/alert-channels -b cookies.txt
```

**Response (200):**

```json
[
  {
    "id": "uuid",
    "team_id": "uuid",
    "channel_type": "slack",
    "config": { "webhook_url": "https://hooks.slack.com/services/T00/B00/xxx" },
    "is_active": true,
    "created_at": "2024-01-15T10:00:00.000Z"
  }
]
```

---

### `POST /api/teams/:id/alert-channels`

Create an alert channel. Requires team lead role or admin.

**Slack channel:**

```bash
curl -X POST http://localhost:3001/api/teams/<team-id>/alert-channels \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{
    "channel_type": "slack",
    "config": { "webhook_url": "https://hooks.slack.com/services/T00/B00/xxx" }
  }'
```

**Webhook channel:**

```bash
curl -X POST http://localhost:3001/api/teams/<team-id>/alert-channels \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{
    "channel_type": "webhook",
    "config": {
      "url": "https://example.com/webhook",
      "headers": { "Authorization": "Bearer token" },
      "method": "POST"
    }
  }'
```

**Validation:**

- Slack `webhook_url` must match `https://hooks.slack.com/services/...`
- Webhook `url` must be a valid URL
- Webhook `headers` values must be strings
- Webhook `method` must be `POST`, `PUT`, or `PATCH` (default: `POST`)

---

### `PUT /api/teams/:id/alert-channels/:channelId`

Update an alert channel. Requires team lead role or admin.

```bash
curl -X PUT http://localhost:3001/api/teams/<team-id>/alert-channels/<channel-id> \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "is_active": false }'
```

---

### `DELETE /api/teams/:id/alert-channels/:channelId`

Delete an alert channel. Requires team lead role or admin.

```bash
curl -X DELETE http://localhost:3001/api/teams/<team-id>/alert-channels/<channel-id> \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response:** `204 No Content`

---

### `POST /api/teams/:id/alert-channels/:channelId/test`

Send a test alert to a channel. Requires team lead role or admin.

```bash
curl -X POST http://localhost:3001/api/teams/<team-id>/alert-channels/<channel-id>/test \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response (200):**

```json
{ "success": true, "error": null }
```

On failure: `{ "success": false, "error": "Connection timed out" }`

---

### `GET /api/teams/:id/alert-rules`

Get alert rules for a team. Requires team membership (any role).

```bash
curl http://localhost:3001/api/teams/<team-id>/alert-rules -b cookies.txt
```

**Response (200):**

```json
{
  "id": "uuid",
  "team_id": "uuid",
  "severity_filter": "warning",
  "is_active": true,
  "created_at": "2024-01-15T10:00:00.000Z"
}
```

Returns `null` if no rules are configured for the team.

---

### `PUT /api/teams/:id/alert-rules`

Create or update (upsert) alert rules for a team. Requires team lead role or admin.

```bash
curl -X PUT http://localhost:3001/api/teams/<team-id>/alert-rules \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "severity_filter": "critical", "is_active": true }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `severity_filter` | string | Yes | `"critical"`, `"warning"`, or `"all"` |
| `is_active` | boolean | No | Enable/disable rules (default: true) |

---

### `GET /api/teams/:id/alert-history`

Get alert delivery history for a team. Requires team membership (any role).

| Query Param | Type | Description |
|-------------|------|-------------|
| `limit` | number | Max results (default: 50) |
| `offset` | number | Pagination offset |
| `status` | string | Filter: `sent`, `failed`, `suppressed` |

```bash
curl "http://localhost:3001/api/teams/<team-id>/alert-history?status=failed&limit=10" -b cookies.txt
```

**Response (200):**

```json
{
  "entries": [
    {
      "id": "uuid",
      "team_id": "uuid",
      "channel_id": "uuid",
      "channel_type": "slack",
      "event_type": "status_change",
      "payload": { "service": "Payment", "dependency": "postgres", "oldStatus": "healthy", "newStatus": "unhealthy" },
      "status": "sent",
      "error": null,
      "created_at": "2024-01-15T10:00:00.000Z"
    }
  ],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

---

## Wallboard

### `GET /api/wallboard`

Returns dependency-focused wallboard data. All dependencies across active services, deduplicated by canonical name, with aggregated health status and reporters. Admin sees all dependencies; non-admin users see only dependencies from their teams' services.

**Auth:** Session required

```bash
curl http://localhost:3001/api/wallboard \
  -H "Cookie: deps-dashboard.sid=..."
```

**Response:**

```json
{
  "dependencies": [
    {
      "canonical_name": "PostgreSQL",
      "primary_dependency_id": "dep-abc123",
      "health_status": "healthy",
      "type": "database",
      "latency": { "min": 10, "avg": 25, "max": 50 },
      "last_checked": "2024-01-15T10:30:00.000Z",
      "error_message": null,
      "impact": null,
      "description": "Primary database",
      "effective_contact": "{\"email\":\"db-team@example.com\",\"slack\":\"#db-support\"}",
      "effective_impact": "Critical — primary database",
      "linked_service": { "id": "svc-xyz", "name": "Database Service" },
      "reporters": [
        {
          "dependency_id": "dep-abc123",
          "service_id": "svc-1",
          "service_name": "User Service",
          "service_team_id": "team-1",
          "service_team_name": "Platform",
          "healthy": 1,
          "health_state": 0,
          "latency_ms": 25,
          "last_checked": "2024-01-15T10:30:00.000Z"
        }
      ],
      "team_ids": ["team-1"]
    }
  ],
  "teams": [
    { "id": "team-1", "name": "Platform" }
  ]
}
```

**Health status aggregation:** When multiple services report the same dependency (matched by canonical name), the worst status wins: `critical` > `warning` > `healthy` > `unknown`.

**Latency aggregation:** `min`, `avg`, `max` computed across all reporters' current `latency_ms` values.

**Primary dependency:** The most recently checked dependency in the group, used for chart display (`LatencyChart`, `HealthTimeline`).

**Override resolution:** `effective_contact` and `effective_impact` are resolved from the primary dependency's 3-tier override hierarchy (instance > canonical > polled). Contact uses field-level merge; impact uses first-non-null precedence.

---

## Canonical Overrides

Canonical overrides set default contact and impact values for all dependencies sharing a canonical name. They sit in the middle of the 3-tier merge hierarchy: instance override > canonical override > polled data.

### `GET /api/canonical-overrides`

List all canonical overrides. Requires authentication.

```bash
curl http://localhost:3001/api/canonical-overrides -b cookies.txt
```

**Response (200):** Array of canonical override objects.

```json
[
  {
    "id": "uuid",
    "canonical_name": "PostgreSQL",
    "contact_override": "{\"email\":\"db-team@example.com\",\"slack\":\"#db-support\"}",
    "impact_override": "Critical — all downstream services depend on this",
    "created_at": "2026-02-24T10:00:00.000Z",
    "updated_at": "2026-02-24T10:00:00.000Z",
    "updated_by": "user-uuid"
  }
]
```

---

### `GET /api/canonical-overrides/:canonicalName`

Get a single canonical override by name. Requires authentication.

```bash
curl http://localhost:3001/api/canonical-overrides/PostgreSQL -b cookies.txt
```

**Response (200):** The canonical override object. Returns `404` if not found.

---

### `PUT /api/canonical-overrides/:canonicalName`

Create or update a canonical override. Requires admin role OR team lead of any team that owns a service with a dependency matching the given canonical name.

```bash
curl -X PUT http://localhost:3001/api/canonical-overrides/PostgreSQL \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{
    "contact_override": { "email": "db-team@example.com", "slack": "#db-support" },
    "impact_override": "Critical — all downstream services depend on this"
  }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contact_override` | object/null | No | Contact info object (set to `null` to clear). Stored as JSON string. |
| `impact_override` | string/null | No | Impact description (set to `null` to clear). |

At least one field must be provided (400 otherwise).

**Response (200):** The created or updated canonical override object.

**Audit action:** `canonical_override.upserted`

---

### `DELETE /api/canonical-overrides/:canonicalName`

Delete a canonical override. Same permission requirements as PUT.

```bash
curl -X DELETE http://localhost:3001/api/canonical-overrides/PostgreSQL \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response:** `204 No Content`

**Audit action:** `canonical_override.deleted`

---

## Per-Instance Dependency Overrides

Per-instance overrides set contact and/or impact for a specific dependency instance (service-dependency pair). These take highest precedence in the merge hierarchy: instance override > canonical override > polled data.

### `PUT /api/dependencies/:id/overrides`

Set per-instance overrides on a dependency. Requires admin role OR team lead of the team that owns the service reporting this dependency.

```bash
curl -X PUT http://localhost:3001/api/dependencies/<dep-id>/overrides \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{
    "contact_override": { "email": "db-team@example.com", "slack": "#db-support" },
    "impact_override": "Critical — primary database"
  }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contact_override` | object/null | No | Contact info object (set to `null` to clear). Stored as JSON string. |
| `impact_override` | string/null | No | Impact description (set to `null` to clear). |

At least one field must be provided (400 otherwise).

**Response (200):** The full updated dependency row.

**Audit action:** `dependency_override.updated`

---

### `DELETE /api/dependencies/:id/overrides`

Clear all per-instance overrides on a dependency (sets both `contact_override` and `impact_override` to null). Does not modify polled data columns. Same permission requirements as PUT.

```bash
curl -X DELETE http://localhost:3001/api/dependencies/<dep-id>/overrides \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response:** `204 No Content`

**Audit action:** `dependency_override.cleared`
