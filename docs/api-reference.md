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

**Audit action types:** `user.role_changed`, `user.deactivated`, `user.reactivated`, `team.created`, `team.updated`, `team.deleted`, `team.member_added`, `team.member_removed`, `team.member_role_changed`, `service.created`, `service.updated`, `service.deleted`, `external_service.created`, `external_service.updated`, `external_service.deleted`, `settings.updated`, `canonical_override.upserted`, `canonical_override.deleted`, `dependency_override.updated`, `dependency_override.cleared`, `manifest_sync`, `manifest_config.created`, `manifest_config.updated`, `manifest_config.deleted`, `drift.detected`, `drift.accepted`, `drift.dismissed`, `drift.reopened`, `drift.resolved`, `drift.bulk_accepted`, `drift.bulk_dismissed`

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

---

## Manifest Configuration

Team-scoped manifest management. Manifests define services, aliases, overrides, and associations declaratively via a JSON URL. See the [Manifest Schema Reference](manifest-schema.md) for the full schema, validation rules, and examples.

### `GET /api/teams/:id/manifest`

Get the manifest configuration for a team. Returns `null` if no manifest is configured.

**Auth:** Team member (any role)

```bash
curl http://localhost:3001/api/teams/<team-id>/manifest -b cookies.txt
```

**Response (200):**

```json
{
  "id": "uuid",
  "team_id": "uuid",
  "manifest_url": "https://example.com/manifest.json",
  "is_enabled": 1,
  "sync_policy": "{\"on_field_drift\":\"flag\",\"on_removal\":\"flag\",\"on_alias_removal\":\"keep\",\"on_override_removal\":\"keep\",\"on_association_removal\":\"keep\"}",
  "last_sync_at": "2026-02-28T10:00:00.000Z",
  "last_sync_status": "success",
  "last_sync_error": null,
  "last_sync_summary": "{\"services\":{\"created\":2,\"updated\":0,\"deactivated\":0,\"deleted\":0,\"drift_flagged\":0,\"unchanged\":1},\"aliases\":{\"created\":1,\"updated\":0,\"removed\":0,\"unchanged\":0},\"overrides\":{\"created\":0,\"updated\":0,\"removed\":0,\"unchanged\":0},\"associations\":{\"created\":1,\"removed\":0,\"unchanged\":0}}",
  "created_at": "2026-02-28T09:00:00.000Z",
  "updated_at": "2026-02-28T10:00:00.000Z"
}
```

Returns `null` body when no manifest is configured for the team.

---

### `PUT /api/teams/:id/manifest`

Create or update a team's manifest configuration. Requires team lead or admin role.

```bash
curl -X PUT http://localhost:3001/api/teams/<team-id>/manifest \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{
    "manifest_url": "https://example.com/manifest.json",
    "sync_policy": {
      "on_field_drift": "flag",
      "on_removal": "deactivate"
    }
  }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `manifest_url` | string | Yes | HTTP or HTTPS URL pointing to a JSON manifest. SSRF-validated. |
| `is_enabled` | boolean | No | Enable/disable scheduled sync (default: true). |
| `sync_policy` | object | No | Partial sync policy. Unset fields use defaults. |

**Sync policy fields:**

| Field | Values | Default | Description |
|-------|--------|---------|-------------|
| `on_field_drift` | `flag`, `manifest_wins`, `local_wins` | `flag` | How to handle manually edited fields. |
| `on_removal` | `flag`, `deactivate`, `delete` | `flag` | How to handle services removed from manifest. |
| `on_alias_removal` | `remove`, `keep` | `keep` | How to handle aliases removed from manifest. |
| `on_override_removal` | `remove`, `keep` | `keep` | How to handle overrides removed from manifest. |
| `on_association_removal` | `remove`, `keep` | `keep` | How to handle associations removed from manifest. |

**Response (200):** The created or updated manifest config object.

**Errors:**

| Status | Condition |
|--------|-----------|
| `400` | Invalid URL format, SSRF-blocked hostname, or invalid sync policy values |
| `403` | Not a team lead or admin |

**Audit actions:** `manifest_config.created` or `manifest_config.updated`

---

### `DELETE /api/teams/:id/manifest`

Remove a team's manifest configuration. Does **not** delete services that were created by the manifest — they remain active but are no longer manifest-managed.

**Auth:** Team lead or admin

```bash
curl -X DELETE http://localhost:3001/api/teams/<team-id>/manifest \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response:** `204 No Content`

**Audit action:** `manifest_config.deleted`

---

## Manifest Sync

### `POST /api/teams/:id/manifest/sync`

Trigger a manual sync for a team's manifest. Fetches the manifest URL, validates, diffs against current state, and applies changes.

**Auth:** Team member (any role)

```bash
curl -X POST http://localhost:3001/api/teams/<team-id>/manifest/sync \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response (200):**

```json
{
  "status": "success",
  "summary": {
    "services": {
      "created": 2,
      "updated": 1,
      "deactivated": 0,
      "deleted": 0,
      "drift_flagged": 1,
      "unchanged": 3
    },
    "aliases": {
      "created": 1,
      "updated": 0,
      "removed": 0,
      "unchanged": 2
    },
    "overrides": {
      "created": 0,
      "updated": 0,
      "removed": 0,
      "unchanged": 1
    },
    "associations": {
      "created": 1,
      "removed": 0,
      "unchanged": 2
    }
  },
  "errors": [],
  "warnings": ["services[2].health_endpoint: URL targets a private or internal address"],
  "changes": [
    { "manifest_key": "svc-a", "service_name": "Service A", "action": "created" },
    { "manifest_key": "svc-b", "service_name": "Service B", "action": "updated", "fields_changed": ["description"] },
    { "manifest_key": "svc-c", "service_name": "Service C", "action": "drift_flagged", "drift_fields": ["health_endpoint"] }
  ],
  "duration_ms": 1250
}
```

**Status values:**

| Status | Meaning |
|--------|---------|
| `success` | All entries processed without errors |
| `partial` | Some entries succeeded, others had errors (e.g., SSRF-blocked endpoints) |
| `failed` | Sync failed entirely (fetch error, validation failure, etc.) |

**Errors:**

| Status | Condition |
|--------|-----------|
| `404` | No manifest configured for this team |
| `400` | Manifest is disabled |
| `409` | Sync already in progress for this team |
| `429` | Manual sync cooldown active (60s). Includes `Retry-After` header. |

**Audit action:** `manifest_sync`

---

### `GET /api/teams/:id/manifest/sync-history`

Get paginated sync history for a team.

**Auth:** Team member (any role)

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `limit` | number | 20 | Max results (max 100) |
| `offset` | number | 0 | Pagination offset |

```bash
curl "http://localhost:3001/api/teams/<team-id>/manifest/sync-history?limit=10" -b cookies.txt
```

**Response (200):**

```json
{
  "entries": [
    {
      "id": "uuid",
      "team_id": "uuid",
      "trigger_type": "manual",
      "triggered_by": "user-uuid",
      "manifest_url": "https://example.com/manifest.json",
      "status": "success",
      "summary": "{\"services\":{\"created\":2,\"updated\":0,...}}",
      "errors": null,
      "warnings": null,
      "duration_ms": 850,
      "created_at": "2026-02-28T10:00:00.000Z"
    }
  ],
  "total": 15
}
```

---

### `POST /api/manifest/validate`

Dry-run manifest validation. Validates the provided JSON against the manifest schema without persisting anything or triggering a sync.

**Auth:** Any authenticated user

```bash
curl -X POST http://localhost:3001/api/manifest/validate \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "version": 1,
    "services": [
      {
        "key": "test-svc",
        "name": "Test Service",
        "health_endpoint": "https://test.example.com/health"
      }
    ]
  }'
```

**Response (200):**

```json
{
  "valid": true,
  "version": 1,
  "service_count": 1,
  "valid_count": 1,
  "errors": [],
  "warnings": []
}
```

---

## Drift Flags

Drift flags are created when the sync engine detects differences between the manifest and local state. Flags require review and action (accept, dismiss, or reopen).

### `GET /api/teams/:id/drifts`

List drift flags for a team with filtering. Defaults to pending flags.

**Auth:** Team member (any role)

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `status` | string | `pending` | Filter: `pending`, `dismissed`, `accepted`, `resolved` |
| `drift_type` | string | — | Filter: `field_change`, `service_removal` |
| `service_id` | uuid | — | Filter by service |
| `limit` | number | 50 | Max results (max 250) |
| `offset` | number | 0 | Pagination offset |

```bash
curl "http://localhost:3001/api/teams/<team-id>/drifts?status=pending&drift_type=field_change" -b cookies.txt
```

**Response (200):**

```json
{
  "flags": [
    {
      "id": "uuid",
      "team_id": "uuid",
      "service_id": "uuid",
      "service_name": "Payment API",
      "manifest_key": "payment-api",
      "drift_type": "field_change",
      "field_name": "health_endpoint",
      "manifest_value": "https://payment-v2.example.com/health",
      "current_value": "https://payment.example.com/health",
      "status": "pending",
      "first_detected_at": "2026-02-28T10:00:00.000Z",
      "last_detected_at": "2026-02-28T11:00:00.000Z",
      "resolved_at": null,
      "resolved_by": null,
      "sync_history_id": "uuid",
      "created_at": "2026-02-28T10:00:00.000Z"
    }
  ],
  "summary": {
    "pending_count": 3,
    "dismissed_count": 1,
    "field_change_pending": 2,
    "service_removal_pending": 1
  },
  "total": 3
}
```

---

### `GET /api/teams/:id/drifts/summary`

Get lightweight drift flag counts for badge display.

**Auth:** Team member (any role)

```bash
curl http://localhost:3001/api/teams/<team-id>/drifts/summary -b cookies.txt
```

**Response (200):**

```json
{
  "pending_count": 3,
  "dismissed_count": 1,
  "field_change_pending": 2,
  "service_removal_pending": 1
}
```

---

### `PUT /api/teams/:id/drifts/:driftId/accept`

Accept a drift flag. Applies the manifest value to the service.

**Auth:** Team lead or admin

```bash
curl -X PUT http://localhost:3001/api/teams/<team-id>/drifts/<drift-id>/accept \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Accept behavior by drift type:**

- **`field_change`:** Updates the service field to `manifest_value`. Re-validates SSRF for URL fields. Validates `poll_interval_ms` bounds. Updates the synced snapshot. Restarts polling if `health_endpoint` or `poll_interval_ms` changed.
- **`service_removal`:** Deactivates the service (`is_active=0`) and stops polling.

**Response (200):** The updated drift flag object.

**Errors:**

| Status | Condition |
|--------|-----------|
| `400` | SSRF validation failed for a URL field, or invalid bounds |
| `404` | Drift flag not found or belongs to a different team |
| `409` | Flag already accepted or resolved |

**Audit action:** `drift.accepted`

---

### `PUT /api/teams/:id/drifts/:driftId/dismiss`

Dismiss a drift flag. The flag remains visible in the dismissed view.

**Auth:** Team lead or admin

```bash
curl -X PUT http://localhost:3001/api/teams/<team-id>/drifts/<drift-id>/dismiss \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response (200):** The updated drift flag object.

**Audit action:** `drift.dismissed`

---

### `PUT /api/teams/:id/drifts/:driftId/reopen`

Reopen a previously dismissed drift flag back to pending.

**Auth:** Team lead or admin

```bash
curl -X PUT http://localhost:3001/api/teams/<team-id>/drifts/<drift-id>/reopen \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt
```

**Response (200):** The updated drift flag object with `status: "pending"`.

**Errors:** Returns `400` if the flag is not in `dismissed` status.

**Audit action:** `drift.reopened`

---

### `POST /api/teams/:id/drifts/bulk-accept`

Bulk accept drift flags. Processes up to 100 flags in a transaction. Best-effort: SSRF failures on individual URL fields skip that flag but continue with others.

**Auth:** Team lead or admin

```bash
curl -X POST http://localhost:3001/api/teams/<team-id>/drifts/bulk-accept \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "flag_ids": ["drift-id-1", "drift-id-2"] }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `flag_ids` | string[] | Yes | Array of drift flag IDs to accept. Max 100. |

**Response (200):**

```json
{
  "result": {
    "succeeded": 2,
    "failed": 0,
    "errors": []
  }
}
```

**Audit action:** `drift.bulk_accepted`

---

### `POST /api/teams/:id/drifts/bulk-dismiss`

Bulk dismiss drift flags. Processes up to 100 flags in a transaction.

**Auth:** Team lead or admin

```bash
curl -X POST http://localhost:3001/api/teams/<team-id>/drifts/bulk-dismiss \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{ "flag_ids": ["drift-id-1", "drift-id-2"] }'
```

**Request body:** Same as bulk-accept.

**Response (200):** Same shape as bulk-accept.

**Audit action:** `drift.bulk_dismissed`
