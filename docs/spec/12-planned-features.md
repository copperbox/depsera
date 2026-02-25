# 12. Planned Features (1.0)

All items in this section are **[Planned]**. See the [PRD](../PRD-1.0.md) for full requirements and implementation order.

## 12.1 Security Hardening (Phase 1)

- **SQL injection prevention:** ~~Whitelist allowed `ORDER BY` columns per store query to eliminate string-interpolation vectors.~~ **[Implemented]** (PRO-67).
- **IDOR fixes:** ~~Association routes need team ownership verification (not just `requireAuth`).~~ **[Implemented]** (PRO-91). Alias mutations need `requireAdmin`. **[Implemented]** (PRO-92).
- **Error sanitization:** ~~Replace raw `error.message` in 500 responses with a sanitized utility. Scrub internal URLs/IPs from stored poll error messages.~~ **[Implemented]** (PRO-68). All route handlers use `sendErrorResponse()`. Non-operational errors return generic `{ error: "Internal server error" }`. Poll errors sanitized via `sanitizePollError()` before DB storage.
- **Auth bypass hardening:** ~~Default `AUTH_BYPASS=false` in `.env.example`. Remove committed `.env` from repo. Block bypass in production.~~ **[Implemented then Removed]** (PRO-69). Auth bypass mode was fully removed — `LOCAL_AUTH=true` replaces it for development use.
- **Session cookie improvements:** ~~Evaluate `sameSite: 'strict'` against OIDC callback flow. Add startup warning if `secure` is false outside dev.~~ **[Implemented]** (PRO-70). `sameSite` remains `'lax'` — `'strict'` breaks the OIDC callback flow because the browser won't send the session cookie on the cross-origin redirect from the identity provider, causing PKCE code verifier and state to be unavailable. This is documented in a code comment. CSRF protection (double-submit cookie) mitigates the reduced protection. Cookie path explicitly set to `/`. `warnInsecureCookies()` runs at startup and logs a warning if `secure` will be false outside development (when neither `REQUIRE_HTTPS` nor `TRUST_PROXY` is configured). See `/server/src/auth/session.ts`.
- **Server-side hardening:** ~~Timing-safe OIDC state comparison, explicit body size limits on `express.json()`, session destroy error handling, SQLite WAL pragmas, `eslint-plugin-security`.~~ **[Implemented]** (PRO-95). OIDC state compared via `crypto.timingSafeEqual` in callback. `express.json({ limit: '100kb' })` prevents oversized payloads. Session destroy errors now return 500 instead of silently succeeding. SQLite `synchronous = FULL` and `wal_autocheckpoint = 1000` pragmas set in database initialization. `eslint-plugin-security` added to server ESLint config (recommended-legacy ruleset).
- **Client-side hardening:** ~~`URLSearchParams` for query encoding, validate localStorage JSON parsing, `eslint-plugin-security`.~~ **[Implemented]** (PRO-96). All query string construction uses `URLSearchParams` (replaced string interpolation in `services.ts`). localStorage JSON parsing in `graphLayoutStorage.ts` validates each entry against `NodePosition` schema (`isNodePosition()` type guard with `isFinite` checks), filtering out malformed entries. `eslint-plugin-security` added to client ESLint config (recommended-legacy ruleset).
- **HTTP request logging:** ~~Structured logging via `pino` + `pino-http` (method, path, status, response time, user ID). JSON in production, readable in dev. Configurable via `LOG_LEVEL`.~~ **[Implemented]** (PRO-93). All HTTP requests logged via `pino-http` middleware with method, path, status, response time, user ID. Sensitive headers (Authorization, Cookie, X-CSRF-Token) redacted. Health check endpoint optionally excluded from logs. See `/server/src/utils/logger.ts` and `/server/src/middleware/requestLogger.ts`.
- **Audit trail:** ~~`audit_log` table and store. Log admin actions. `GET /api/admin/audit-log` (admin only).~~ **[Implemented]** (PRO-94). `audit_log` table with `AuditLogStore` and fire-and-forget `AuditLogService`. Logs role changes, user deactivation/reactivation, team CRUD, team member changes, and service CRUD. `GET /api/admin/audit-log` endpoint with pagination and filters (date range, action, resource type, user). See `/server/src/services/audit/AuditLogService.ts` and `/server/src/routes/admin/auditLog.ts`.

## 12.2 Team-Scoped Access Control (Phase 2)

- `GET /api/services` returns only the user's team services (unless admin) **[Implemented]** (PRO-97)
- `GET /api/services/:id` requires team membership (or admin) **[Implemented]** (PRO-97)
- `POST /api/services/:id/poll` requires team membership (not just lead) **[Implemented]** (PRO-97)
- Service CRUD restricted to team leads of the owning team **[Implemented]** (existing middleware)
- Graph, wallboard, and dashboard endpoints continue to return all services org-wide **[Implemented]**
- Client adjusts team filter behavior and empty states **[Implemented]** (PRO-98)

## 12.3 Admin Settings (Phase 2–3)

**Backend:** **[Implemented]** (PRO-75). `settings` key-value table with in-memory cache. `GET /api/admin/settings` and `PUT /api/admin/settings` (admin only). Env vars serve as initial defaults; DB settings override at runtime. `SettingsService` singleton provides cache layer with `get()` and `getAll()` methods. Validation rules enforce value ranges per key. See `/server/src/services/settings/SettingsService.ts` and `/server/src/routes/admin/settings.ts`.

**Settings keys:**

| Key | Default | Description |
|---|---|---|
| `data_retention_days` | 365 | Data retention period |
| `retention_cleanup_time` | `"02:00"` | Daily cleanup schedule |
| `default_poll_interval_ms` | 30000 | Default poll interval for new services |
| `ssrf_allowlist` | from env var | SSRF allowlist |
| `global_rate_limit` | 100 | Global rate limit |
| `global_rate_limit_window_minutes` | 15 | Global rate limit window |
| `auth_rate_limit` | 10 | Auth rate limit |
| `auth_rate_limit_window_minutes` | 1 | Auth rate limit window |

**Frontend:** **[Implemented]** (PRO-76). Admin-only `/admin/settings` page with collapsible sections for data retention, polling defaults, security (SSRF allowlist + rate limits), and alerts. Form validation, save confirmation toast, and immediate effect. Admin nav updated with section divider and separate "Users" and "Settings" links. See `/client/src/components/pages/Admin/AdminSettings.tsx`.

## 12.4 Data Retention (Phase 2) **[Implemented]**

- Default retention: 365 days, configurable via `DATA_RETENTION_DAYS` env var and admin settings (`data_retention_days`)
- Scheduled cleanup job runs daily at configurable time (default 02:00 local time, admin setting `retention_cleanup_time`)
- Deletes rows from `dependency_latency_history`, `dependency_error_history`, and `audit_log` older than retention period
- `alert_history` cleanup will be added when alerting is implemented
- Logs number of deleted rows per table
- Runs overdue check on startup (catches up if server was down during scheduled time)
- Graceful shutdown stops the scheduler
- See `DataRetentionService` in `/server/src/services/retention/DataRetentionService.ts`

## 12.5 Custom Health Endpoint Schema (Phase 4)

Support for services that don't use the proactive-deps format:

**Data model:** **[Implemented]** (PRO-78). `schema_config` nullable TEXT column on `services` table (migration 012). Stores a JSON-serialized `SchemaMapping` object. TypeScript types `SchemaMapping`, `FieldMapping`, `BooleanComparison` in `/server/src/db/types.ts`. Validation via `validateSchemaConfig()` in `/server/src/utils/validation.ts` — validates structure, required fields (`name`, `healthy`), optional fields (`latency`, `impact`, `description`, `type`, `checkDetails`, `contact`), rejects unknown fields. Accepts both JSON strings and objects, returns validated JSON string. Services without a mapping default to proactive-deps format.

**Schema mapping structure:**
```json
{
  "root": "data.healthChecks",
  "fields": {
    "name": "checkName",
    "healthy": { "field": "status", "equals": "ok" },
    "latency": "responseTimeMs",
    "impact": "severity",
    "description": "displayName",
    "contact": "metadata.contact_info"
  }
}
```

- `root`: JSON path (dot notation) to the array of dependency checks
- `fields.name`: Direct field mapping (required)
- `fields.healthy`: Direct mapping or boolean comparison (`field` + `equals` value match) (required)
- `fields.latency`, `fields.impact`, `fields.description`: Optional field mappings
- `fields.checkDetails`, `fields.contact`: Optional dot-notation string paths that must resolve to a non-null object. These are simple string paths only (no BooleanComparison). Non-object, null, or array values are silently ignored.
- Nested paths supported: `"metrics.responseTime"`
- Services without a mapping default to proactive-deps
- **Schema-aware parser:** **[Implemented]** (PRO-79). `DependencyParser.parse()` accepts an optional `SchemaMapping` parameter. When provided, delegates to `SchemaMapper` which resolves the `root` path, maps fields via dot-notation path resolution, and handles `BooleanComparison` for the `healthy` field (case-insensitive string comparison). String healthy values are coerced: `ok`, `healthy`, `up`, `true` → healthy; `error`, `unhealthy`, `down`, `critical`, `false` → unhealthy. Optional object fields (`checkDetails`, `contact`) are extracted via dot-notation path and validated as non-null, non-array objects; invalid types are silently ignored. Malformed items (missing name, unresolvable healthy) are skipped with logged warnings. `ServicePoller` parses the service's `schema_config` JSON and passes it to the parser. See `/server/src/services/polling/SchemaMapper.ts` and `/server/src/services/polling/DependencyParser.ts`.
- Test endpoint: **[Implemented]** (PRO-104, DPS-13b). `POST /api/services/test-schema` — authenticated (team lead+ or admin), accepts `{ url, schema_config }`, validates SSRF, fetches URL, applies schema mapping via `DependencyParser`, returns `{ success, dependencies[], warnings[] }`. Each dependency in the response includes `contact` (parsed object or null). Does NOT store anything. 10-second timeout. Warnings include missing optional field mappings (including `contact`), empty results, and zero-latency entries. See `/server/src/routes/services/testSchema.ts`.
- UI: **[Implemented]** (PRO-105, DPS-13b). Toggle between "proactive-deps" and "Custom schema" on service form, with guided form (including contact field input) + raw JSON editor and test button. Test-schema preview table displays a Contact column showing parsed contact key-value pairs. See `/client/src/components/pages/Services/SchemaConfigEditor.tsx`.
- Documentation: **[Implemented]** (PRO-112). `docs/health-endpoint-spec.md` covers proactive-deps default format, custom schema mapping configuration, examples for Spring Boot Actuator and ASP.NET Health Checks, testing guide (UI and API), and troubleshooting. 51 tests validate documentation accuracy.

## 12.6 Alerting (Phase 5)

**Alert channels:** Slack (incoming webhook) and generic HTTP webhook, configured per team.

**Alert API routes:** **[Implemented]** (PRO-106). Team-scoped CRUD for alert channels (`/api/teams/:id/alert-channels`), alert rules (`/api/teams/:id/alert-rules`), and alert history (`/api/teams/:id/alert-history`). Team members can read; team leads+ can create/update/delete. Test endpoint sends a test alert via the configured channel. Input validation for Slack webhook URLs and generic webhook URLs. See `/server/src/routes/alerts/`.

**Alert dispatch:** **[Implemented]** (PRO-82). `AlertService` singleton listens to `STATUS_CHANGE` and `POLL_ERROR` events from the polling system. Evaluates team alert rules with severity filtering (critical only, warning+, or all). Pluggable `IAlertSender` interface for channel type implementations. See `/server/src/services/alerts/AlertService.ts`.

**Flap protection:** **[Implemented]** (PRO-82). `FlapProtector` suppresses repeated alerts for the same dependency within a configurable cooldown (default 5 minutes, admin setting `alert_cooldown_minutes`). In-memory Map keyed by dependencyId (or serviceId for service-level events). See `/server/src/services/alerts/FlapProtector.ts`.

**Rate limiting:** **[Implemented]** (PRO-82). `AlertRateLimiter` enforces per-team hourly alert limits (default 30, admin setting `alert_rate_limit_per_hour`). Windows reset automatically after 1 hour. See `/server/src/services/alerts/AlertRateLimiter.ts`.

**Alert lifecycle:** **[Implemented]** (PRO-82). dispatch → record in `alert_history` (including suppressed) → retry once after 30s on failure. Graceful shutdown flushes pending retries.

**Slack message format:** **[Implemented]** (PRO-83). `SlackSender` implements `IAlertSender`, sending Block Kit-formatted messages to Slack incoming webhooks. Header shows status emoji + service name + Degraded/Recovered. Section shows dependency name + status transition. Context shows severity + timestamp. Actions block includes "View in Depsera" button linking to service detail page (requires `APP_BASE_URL` env var). Poll error events show a warning format with the error message. 10-second request timeout. Handles Slack rate limiting (429) gracefully. Registered in `index.ts` on startup. See `/server/src/services/alerts/senders/SlackSender.ts`.

**Webhook sender:** **[Implemented]** (PRO-84). `WebhookSender` implements `IAlertSender`, sending JSON payloads to generic HTTP webhook URLs. Supports configurable custom headers (for auth tokens, API keys) and configurable HTTP method (POST, PUT, PATCH — default POST). Includes deep link URL via `APP_BASE_URL`. 10-second request timeout. Two event types: `dependency_status_change` and `poll_error`. Registered in `index.ts` on startup. See `/server/src/services/alerts/senders/WebhookSender.ts`.

**Webhook payload (status change):**
```json
{
  "event": "dependency_status_change",
  "service": { "id": "...", "name": "..." },
  "dependency": { "id": "...", "name": "..." },
  "oldStatus": "healthy",
  "newStatus": "critical",
  "severity": "critical",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "url": "https://depsera.internal.com/services/..."
}
```

**Webhook payload (poll error):**
```json
{
  "event": "poll_error",
  "service": { "id": "...", "name": "..." },
  "error": "Connection refused",
  "severity": "critical",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "url": "https://depsera.internal.com/services/..."
}
```

**Alert channel management UI:** **[Implemented]** (PRO-107). `AlertChannels` component integrated into the team detail page. Displays a list of configured alert channels with type icons (Slack/Webhook), truncated webhook URLs, and active/inactive status badges. Team leads and admins can create new channels (Slack webhook or generic HTTP webhook with custom headers and method selection), edit existing channels, toggle enable/disable, test channels (sends a test alert with success/failure feedback), and delete channels with confirmation dialog. Client-side validation enforces Slack webhook URL format and valid URL format. See `client/src/components/pages/Teams/AlertChannels.tsx`, `client/src/hooks/useAlertChannels.ts`, `client/src/api/alerts.ts`, `client/src/types/alert.ts`.

**Alert rules & history UI:** **[Implemented]** (PRO-108). `AlertRules` component on team detail page with severity filter dropdown (Critical only / Warning and above / All status changes) and enable/disable toggle. Team leads and admins see editable form with save button; team members see read-only summary. `AlertHistory` component displays last 50 alerts in reverse chronological order with columns: time, service, dependency, event type, delivery status (sent/failed/suppressed), and channel type. Status filter dropdown for filtering by delivery status. Handles missing/malformed payloads gracefully. See `client/src/components/pages/Teams/AlertRules.tsx`, `client/src/components/pages/Teams/AlertHistory.tsx`, `client/src/hooks/useAlertRules.ts`, `client/src/hooks/useAlertHistory.ts`.

## 12.7 Metrics History Charts (Phase 6)

**API enhancements:** **[Implemented]** (PRO-86)
- `GET /api/latency/:dependencyId/buckets?range=1h|6h|24h|7d|30d` — time-bucketed latency data (`{ buckets: [{ timestamp, min, avg, max, count }] }`). Default range: 24h.
- Bucket sizes: 1h/6h → 1min, 24h → 15min, 7d → 1hr, 30d → 6hr. Efficient SQLite `strftime` aggregation queries.
- `GET /api/dependencies/:id/timeline?range=24h|7d|30d` — health state transitions (`{ transitions: [{ timestamp, state }], currentState }`). Derived from error history (error = unhealthy, recovery = healthy). Default range: 24h.

**Chart components:** **[Implemented]** (PRO-87). Recharts library (`recharts` npm package):
- `LatencyChart` component: line chart with min (green), avg (blue), max (red) lines, custom tooltip with data point count, responsive sizing via `ResponsiveContainer`. Fetches from `/api/latency/:dependencyId/buckets`.
- `HealthTimeline` component: horizontal swimlane bar showing health state periods color-coded green (healthy), red (unhealthy), gray (unknown). Tooltip on hover shows state, time range, and duration. Derived from `/api/dependencies/:id/timeline` transitions.
- `TimeRangeSelector` component: reusable button group supporting any combination of 1h, 6h, 24h, 7d, 30d ranges. Persists selection to localStorage per context via configurable `storageKey`.
- All components support dark mode via CSS custom properties (`--color-chart-min`, `--color-chart-avg`, `--color-chart-max`).
- All components handle loading, error (with retry), and empty states.
- Chart types in `/client/src/types/chart.ts`. API functions in `/client/src/api/latency.ts` and `/client/src/api/timeline.ts`. Components in `/client/src/components/Charts/`.

**Integration:** **[Implemented]** (PRO-88). Service detail page shows per-dependency collapsible panels with latency chart and health timeline. Dashboard shows health distribution bar with percentage healthy, stacked bar visualization, and legend with counts. Charts are self-contained (handle their own data fetching, loading, error, and empty states). Components in `/client/src/components/Charts/` integrated into `ServiceDetail.tsx` and `Dashboard.tsx`.

## 12.8 Local Auth (Phase 3)

- `LOCAL_AUTH=true` env var enables local auth mode
- Passwords: bcrypt, minimum 12 rounds
- Initial admin: `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars
- `POST /api/auth/login` for credentials-based login
- `GET /api/auth/mode` returns `{ mode: "oidc" | "local" }`
- Client renders login form or OIDC button based on mode **[Implemented]** (PRO-100). Login page calls `GET /api/auth/mode` on mount; shows email/password form in local mode, SSO button in OIDC mode. Auth API client in `client/src/api/auth.ts`.
- Admin can create users and reset passwords **[Implemented]** (PRO-101). `POST /api/users` creates a local user (admin only, local auth mode only). `PUT /api/users/:id/password` resets a user's password. Both endpoints gated by `requireLocalAuth` middleware (returns 404 in non-local modes). Admin user management page shows "Create User" button and per-user "Reset Password" action when in local auth mode.

## 12.9 Deployment (Phase 7)

**Docker:** **[Implemented]** (PRO-55). Multi-stage Dockerfile using `node:22-slim`:
- **Build stage:** Installs build tools (python3, make, g++ for `better-sqlite3` native compilation), installs all dependencies via `npm ci`, builds both server (TypeScript) and client (Vite)
- **Production stage:** Installs only production dependencies (`npm ci --omit=dev`), copies built artifacts from build stage, runs as non-root `node` user
- `NODE_ENV=production` baked in
- Internal port 3001 (consumers map via `-p`)
- SQLite data directory as mountable volume (`/app/server/data`)
- Health check: `curl -f http://localhost:3001/api/health` (30s interval, 5s timeout, 10s start period, 3 retries)
- `docker-compose.yml` with sensible defaults: `LOCAL_AUTH=true`, named volume for data persistence, `restart: unless-stopped`, commented OIDC configuration
- `.dockerignore` excludes `node_modules`, `.git`, `data/`, `.env`, test files, docs, and IDE configs
- Defaults to local auth if no OIDC config provided

**Documentation:**
- Installation guide (Docker, bare Node, reverse proxy examples) **[Implemented]** (PRO-111). Comprehensive `docs/installation.md` with Docker quickstart, Docker Compose, bare Node.js deployment, process management (systemd, PM2), reverse proxy examples (nginx with SSL, Caddy with auto-TLS), complete env var reference table (all 23+ env vars), admin settings reference (all 10 runtime-configurable keys), production checklist, SQLite backup/restore procedures (file copy, sqlite3 CLI, Docker volume), automated backup cron examples, and upgrading guide. 69 tests validating doc accuracy against codebase.
- Health endpoint spec and custom schema guide **[Implemented]** (PRO-112). Comprehensive `docs/health-endpoint-spec.md` documenting proactive-deps format (field reference, health states, dependency types, flat format), custom schema mapping (configuration, field mappings, boolean comparisons, dot-notation paths, healthy value coercion), examples (Spring Boot Actuator, ASP.NET Health Checks, custom formats), testing guide (UI and API), and troubleshooting. 51 tests validating documentation accuracy.
- Admin guide (first-run, user management, alerts, SSRF allowlist) **[Implemented]** (PRO-113). Comprehensive `docs/admin-guide.md` covering first-run setup (local auth + OIDC with bootstrap instructions), user management (roles, creation, password reset, deactivation), team management (roles, team-scoped access model), alert configuration (Slack + webhook channels, rules, history, flap protection), admin settings (all four sections with validation ranges), SSRF allowlist configuration, data retention and cleanup behavior, audit log querying, monitoring/observability (health endpoint, logging, polling health), and troubleshooting (common issues with fixes). 101 tests validating documentation accuracy.
- API reference with curl examples **[Implemented]** (PRO-114). `docs/api-reference.md` documents all 55+ REST API endpoints with HTTP method, path, auth requirements, request/response schemas (JSON), curl examples, and error codes. README.md overhauled with badges, architecture diagram, categorized feature list, quick start, pages table, and links to docs. CLAUDE.md updated with v1.0 status and documentation section. 125 tests validate documentation accuracy.
- OIDC manual testing infrastructure **[Implemented]** (PRO-103). `docker-compose.oidc-test.yml` with Keycloak service (quay.io/keycloak/keycloak:26.0) and Depsera, health check dependency, pre-configured OIDC env vars. Keycloak realm export (`keycloak/depsera-test-realm.json`) with `depsera` client (PKCE S256, authorization code, confidential), test users (`admin@test.com`/`admin123`, `user@test.com`/`user123`). `docs/testing-with-keycloak.md` covers quick start, admin console, env vars, running outside Docker, and troubleshooting. `docs/testing-with-okta.md` covers account setup, app registration, redirect URI, env vars, login flow walkthrough, and troubleshooting. 68 tests validating configuration and documentation consistency.
- Apache 2.0 license + CLA
