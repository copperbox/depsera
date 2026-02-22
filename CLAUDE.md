# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Depsera — A dependency monitoring and service health dashboard (v1.0).

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + CSS Modules (`/client`)
- **Backend:** Express.js + TypeScript + SQLite (`/server`)
- **Testing:** Jest + React Testing Library + `oidc-provider` (in-process OIDC server for integration tests)
- **Package Manager:** npm

## Build Commands

```bash
# Install all dependencies
npm run install:all

# Development (runs both server and client)
npm run dev

# Run individually
npm run dev:server    # Backend on port 3001
npm run dev:client    # Frontend on port 3000 (proxies /api to backend)

# Testing
npm test              # Run all tests
npm run test:server   # Server tests only
npm run test:client   # Client tests only

# Linting
npm run lint          # Lint both packages

# Building
npm run build         # Build both packages

# Docker
docker compose up -d              # Run with Docker Compose
docker build -t depsera .          # Build image manually
```

## Database Commands

```bash
# Run from /server directory
npm run db:migrate    # Run pending migrations
npm run db:rollback   # Rollback last migration
npm run db:status     # Show migration status
npm run db:clear      # Clear all data (dangerous!)
```

## Architecture

- `/client` - React SPA with Vite, routes via react-router-dom
- `/server` - Express REST API, SQLite database in `/server/data/` (sessions also stored in SQLite via `better-sqlite3-session-store`)
- `/server/src/middleware/` - Express middleware (security headers, HTTPS redirect, trust proxy, CSRF, rate limiting, request logging, static file serving, compression)
- API proxy configured in Vite dev server (client requests to `/api/*` forward to backend)
- In production, Express serves the built client from `client/dist/` with compression and SPA catch-all routing (auto-detected)

## Docker

Multi-stage `Dockerfile` using `node:22-slim`. Build stage installs native build tools (python3, make, g++ for `better-sqlite3`), builds both client and server. Production stage copies only built artifacts and production dependencies, runs as non-root `node` user. `NODE_ENV=production` baked in. Port 3001 exposed. SQLite data persisted via volume at `/app/server/data`. Health check via `curl -f http://localhost:3001/api/health`. `docker-compose.yml` provides sensible defaults with `LOCAL_AUTH=true` and named volume. `.dockerignore` keeps the build context minimal. `docker-compose.oidc-test.yml` provides a Keycloak + Depsera stack for manual OIDC testing (see `docs/testing-with-keycloak.md`). See `docs/installation.md` for production deployment guide (reverse proxy, backup, process management).

## Database Schema

Core tables:
- `users` - User accounts (OIDC or local auth, has `password_hash` for local mode)
- `teams` - Organizational units that own services
- `team_members` - Junction table for user-team membership
- `services` - Tracked APIs/microservices with health endpoints (has `poll_interval_ms` for per-service poll scheduling, `schema_config` nullable JSON column for custom health endpoint schema mappings)
- `dependencies` - Dependency status data from proactive-deps (has `canonical_name` column for alias resolution)
- `dependency_associations` - Links between dependencies and services
- `dependency_aliases` - Maps reported dependency names (alias) to canonical names
- `dependency_latency_history` - Historical latency data points per dependency
- `dependency_error_history` - Historical error records per dependency
- `audit_log` - Admin action audit trail (user/team/service mutations) with user FK, IP address, and JSON details
- `settings` - Key-value store for runtime-configurable admin settings (key TEXT PK, value TEXT, updated_at, updated_by FK → users)
- `alert_channels` - Team-level alert channel configurations (Slack webhooks, generic webhooks) with JSON config
- `alert_rules` - Team-level alert rules with severity filters (critical, warning, all)
- `alert_history` - Record of sent/failed/suppressed alerts with payload and status

Migrations are in `/server/src/db/migrations/` (001-012). Types are in `/server/src/db/types.ts`.

## Client-Side Storage

- `graph-node-positions-{userId}` — Persisted node positions for manually dragged graph nodes (per user)
- `graph-layout-direction` — Graph layout direction (TB/LR)
- `graph-tier-spacing` — Graph tier spacing value
- `graph-latency-threshold` — High latency threshold percentage

## Store Registry

All data access goes through `StoreRegistry` (`/server/src/stores/index.ts`). Stores:
- `services`, `teams`, `users`, `dependencies`, `associations`, `latencyHistory`, `errorHistory`, `aliases`, `auditLog`, `settings`, `alertChannels`, `alertRules`, `alertHistory`

Interfaces in `/server/src/stores/interfaces/`, implementations in `/server/src/stores/impl/`.

**ORDER BY validation:** All stores that accept `orderBy`/`orderDirection` parameters use `validateOrderBy()` from `/server/src/stores/orderByValidator.ts` to whitelist allowed columns and prevent SQL injection. Each store defines its own `ALLOWED_COLUMNS` set. Invalid columns throw `InvalidOrderByError`.

## Settings Service

`SettingsService` (`/server/src/services/settings/SettingsService.ts`) provides in-memory cached access to admin-configurable settings. Singleton pattern with auto-loading from DB on first access. Settings keys: `data_retention_days`, `retention_cleanup_time`, `default_poll_interval_ms`, `ssrf_allowlist`, `global_rate_limit`, `global_rate_limit_window_minutes`, `auth_rate_limit`, `auth_rate_limit_window_minutes`, `alert_cooldown_minutes`, `alert_rate_limit_per_hour`. Env vars serve as initial defaults; DB values override at runtime.

**Admin Settings UI:** `/admin/settings` page (`/client/src/components/pages/Admin/AdminSettings.tsx`) with collapsible sections for Data Retention, Polling Defaults, Security (SSRF allowlist + rate limits), and Alerts. API client in `/client/src/api/settings.ts`. Admin sidebar has separate "Users" and "Settings" links under an "Admin" section divider.

## Data Retention

`DataRetentionService` (`/server/src/services/retention/DataRetentionService.ts`) runs scheduled cleanup of old history data. Singleton pattern with start/stop lifecycle wired into `index.ts`.

- **Retention period:** Configurable via `DATA_RETENTION_DAYS` env var or admin setting `data_retention_days` (default: 365 days)
- **Cleanup schedule:** Daily at configurable time via `RETENTION_CLEANUP_TIME` env var or admin setting `retention_cleanup_time` (default: `02:00` local time)
- **Tables cleaned:** `dependency_latency_history`, `dependency_error_history`, `audit_log`, `alert_history`
- **Scheduling:** Checks once per minute if cleanup time has passed; runs at most once per day; catches up on startup if overdue
- **Graceful shutdown:** `stop()` clears the scheduler interval

## Polling Architecture

The health polling system uses cache-TTL-driven per-service scheduling with resilience patterns:

- **Tick interval:** 5 seconds — each tick checks which services are due for polling
- **Per-service interval:** Configurable via `poll_interval_ms` (default 30000, min 5000, max 3600000)
- **Exponential backoff:** On failure, poll delay increases exponentially (base 1s, max 5min, 2x multiplier)
- **Circuit breaker:** After 10 consecutive failures, circuit opens for 5min cooldown. After cooldown, a single probe is allowed (half-open). Success closes the circuit; failure re-opens it.
- **PollCache:** In-memory TTL cache that tracks when each service was last polled. Services are only polled when their cache entry expires.
- **Host rate limiting:** Per-hostname concurrency semaphore (default max 3, env: `POLL_MAX_CONCURRENT_PER_HOST`) prevents using the polling service as a DDoS amplifier. Services that can't acquire a slot are skipped this tick and retried next tick.
- **Poll deduplication:** Promise coalescing for services sharing the same health endpoint URL. Only one HTTP request is made per unique URL per poll cycle; all services sharing that URL receive the same result but maintain independent circuit breaker and backoff state.

## Security

- **Security Headers:** Helmet middleware provides CSP (with `'unsafe-inline'` for styles, `'unsafe-eval'`/`ws:` in dev for Vite HMR), X-Frame-Options DENY, X-Content-Type-Options nosniff, HSTS (production only), and other defaults. See `/server/src/middleware/securityHeaders.ts`.
- **HTTPS Redirect:** Optional 301 redirect from HTTP to HTTPS when `REQUIRE_HTTPS=true`. Exempts `/api/health` for load-balancer probes. Requires `TRUST_PROXY` when behind a reverse proxy. See `/server/src/middleware/httpsRedirect.ts`.
- **Trust Proxy:** Configurable `TRUST_PROXY` env var parsed into Express's `trust proxy` setting (boolean, hop count, IP/subnet, or "loopback"). Enables correct `req.secure`, `req.ip` behind reverse proxies. See `/server/src/middleware/trustProxy.ts`.
- **SSRF Protection:** Health endpoint URLs are validated against private/reserved IP ranges (RFC 1918, link-local, loopback, etc.) at service creation/update time. At poll time, DNS is resolved and the resolved IP is checked to prevent DNS rebinding attacks. A configurable `SSRF_ALLOWLIST` env var supports exact hostnames (`localhost`), wildcard patterns (`*.internal`), and CIDR ranges (`10.0.0.0/8`) to allow internal network monitoring while keeping the full block list as a safety default. See `/server/src/utils/ssrf.ts` and `/server/src/utils/ssrf-allowlist.ts`.
- **CSRF Protection:** Double-submit cookie pattern. Server sets a `csrf-token` cookie (readable by JS); client reads it and sends `X-CSRF-Token` header on all mutating requests. CSRF cookie `Secure` flag is set dynamically based on `req.secure`. Middleware in `/server/src/middleware/csrf.ts` validates the match. Client utility in `/client/src/api/csrf.ts`.
- **Local Auth:** Optional `LOCAL_AUTH=true` mode for zero-external-dependency deployment. Passwords hashed with bcryptjs (12 rounds). Initial admin bootstrapped from `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars on first startup. `GET /api/auth/mode` returns current mode (`'oidc'` or `'local'`). `POST /api/auth/login` for credential-based login (local mode only). Login page conditionally renders email/password form (local mode) or SSO button (OIDC mode) based on `GET /api/auth/mode`. Admin user management includes `POST /api/users` (create local user) and `PUT /api/users/:id/password` (reset password), both gated by `requireLocalAuth` middleware which returns 404 in non-local modes. UI shows "Create User" button and per-user "Reset Password" action only in local auth mode. See `/server/src/auth/localAuth.ts`, `/server/src/auth/middleware.ts`, and `/client/src/api/auth.ts`.
- **Session Security:** Session cookie uses `secure: 'auto'` to derive the `Secure` flag from `req.secure` (works with `trust proxy`). Cookie path explicitly set to `/`. `sameSite: 'lax'` (not `strict`) because the OIDC callback is a cross-origin redirect — `strict` would prevent the browser from sending the session cookie, breaking the PKCE flow. CSRF protection mitigates the reduced protection of `lax`. `warnInsecureCookies()` logs a startup warning if `secure` will be false outside development (when neither `REQUIRE_HTTPS` nor `TRUST_PROXY` is configured). In production (`NODE_ENV=production`), the server refuses to start if `SESSION_SECRET` is missing, matches a known weak default, or is shorter than 32 characters. See `/server/src/auth/session.ts` and `/server/src/auth/validateSessionSecret.ts`.
- **Redirect Validation:** Logout redirect URLs are validated to prevent open redirect attacks. Only relative paths, same-origin URLs, and external HTTPS URLs (for OIDC end-session endpoints) are allowed. See `/client/src/utils/redirect.ts`.
- **Rate Limiting:** In-memory rate limiting via `express-rate-limit`. Global limit (100 req/15min per IP) applied before session middleware to reject abusive requests early. Stricter auth limit (10 req/1min per IP) on `/api/auth` to prevent brute-force attacks. All limits configurable via env vars. See `/server/src/middleware/rateLimit.ts`.
- **Error Sanitization:** A global `errorHandler` middleware is registered after all routes in `/server/src/index.ts` to catch framework-level errors (e.g., body-parser `SyntaxError` from malformed JSON) and return sanitized JSON responses. Route handler catch blocks use `sendErrorResponse()` which logs the full error server-side and returns sanitized responses to clients. Non-operational errors (non-`AppError`) return generic `{ error: "Internal server error" }` with no `message` field. `InvalidOrderByError` is treated as client input validation (returns 400). Poll errors are sanitized via `sanitizePollError()` before DB storage — strips private IPs, internal URLs, file paths, and maps known error codes (ECONNREFUSED, ETIMEDOUT, etc.) to safe descriptions. See `/server/src/utils/errors.ts`.
- **HTTP Request Logging:** Structured logging via `pino` + `pino-http`. Logs method, path, status code, response time, and authenticated user ID. Sensitive headers (`Authorization`, `Cookie`, `X-CSRF-Token`, `Set-Cookie`) are redacted. `/api/health` excluded from logs by default. JSON output in production, pretty-printed in development. Configurable via `LOG_LEVEL` env var (default: `info`). See `/server/src/utils/logger.ts` and `/server/src/middleware/requestLogger.ts`.
- **Audit Trail:** Admin action audit log records all user, team, and service mutations with actor, action, resource, details, and IP address. Fire-and-forget logging — errors are logged but never block the request. Admin-only query endpoint with filtering by date range, user, action, and resource type. See `/server/src/services/audit/AuditLogService.ts`.
- **Body Size Limit:** `express.json({ limit: '100kb' })` prevents oversized request payloads.
- **Timing-Safe Auth:** OIDC callback state parameter compared using `crypto.timingSafeEqual` to prevent timing attacks. See `/server/src/routes/auth/callback.ts`.
- **SQLite Durability:** `synchronous = FULL` pragma ensures durability even on power loss. `wal_autocheckpoint = 1000` prevents unbounded WAL growth. See `/server/src/db/index.ts`.
- **ESLint Security:** `eslint-plugin-security` (recommended-legacy ruleset) added to server ESLint config for static security analysis.
- **OIDC Integration Tests:** Full login-flow integration tests using `oidc-provider` as an in-process OIDC server. Covers login redirect, callback token exchange, user creation/sync, session establishment, logout, first-user admin bootstrap, and error handling. Mocks `openid-client` (ESM-only) with CJS-compatible implementations. See `/server/src/__tests__/integration/oidc.test.ts` and `/server/src/__tests__/helpers/oidcProvider.ts`.

Key files in `/server/src/services/polling/`:
- `HealthPollingService.ts` — Main orchestrator (singleton)
- `CircuitBreaker.ts` — Per-service circuit breaker (closed/open/half-open)
- `PollCache.ts` — In-memory TTL cache for poll scheduling
- `backoff.ts` — Exponential backoff utility
- `PollStateManager.ts` — In-memory state tracking per service
- `ServicePoller.ts` — Executes individual service polls
- `HostRateLimiter.ts` — Per-hostname concurrency semaphore for poll DDoS protection
- `PollDeduplicator.ts` — Promise coalescing for concurrent polls to the same URL
- `SchemaMapper.ts` — Maps custom health endpoint responses using `SchemaMapping` config (dot-notation path resolution, `BooleanComparison` healthy field). Auto-detects array vs object-keyed root; supports `$key` sentinel in `fields.name` to use object keys as dependency names (for Spring Boot Actuator, ASP.NET Health Checks, etc.)
- `DependencyParser.ts` — Parses health responses; delegates to `SchemaMapper` when a `SchemaMapping` is provided, otherwise uses default proactive-deps format

## Alert Dispatch Engine

`AlertService` (`/server/src/services/alerts/AlertService.ts`) is a singleton that subscribes to `HealthPollingService` events and dispatches alerts to team-configured channels. Started alongside `HealthPollingService` in `index.ts`.

- **Event listeners:** `status:change` (dependency health transitions) and `poll:error` (service poll failures)
- **Dispatch flow:** Look up owning team → evaluate active alert rules (severity filter) → check flap protection → check rate limit → dispatch to active channels → record in `alert_history`
- **Flap protection:** `FlapProtector` suppresses repeated alerts for the same dependency within a configurable cooldown (default 5 min, admin setting `alert_cooldown_minutes`)
- **Rate limiting:** `AlertRateLimiter` enforces per-team hourly alert limits (default 30/hr, admin setting `alert_rate_limit_per_hour`), window resets automatically
- **Sender interface:** Pluggable `IAlertSender` per channel type (Slack, webhook). Senders registered via `registerSender()` before `start()`
- **Retry:** Failed dispatches retry once after 30 seconds. Pending retries flushed on graceful shutdown
- **History recording:** Fire-and-forget — all attempts (sent, failed, suppressed) recorded in `alert_history`

Key files in `/server/src/services/alerts/`:
- `AlertService.ts` — Main dispatch engine (singleton)
- `FlapProtector.ts` — Cooldown-based duplicate suppression
- `AlertRateLimiter.ts` — Per-team hourly rate limiter
- `types.ts` — `AlertEvent`, `IAlertSender`, `SendResult` interfaces
- `senders/SlackSender.ts` — Slack incoming webhook sender (Block Kit format, 10s timeout, 429 handling)
- `senders/WebhookSender.ts` — Generic HTTP webhook sender (JSON payload, custom headers, configurable method, 10s timeout)

## Schema Mapping Form UI

`SchemaConfigEditor` component (`/client/src/components/pages/Services/SchemaConfigEditor.tsx`) provides a "Health Endpoint Format" section on the service create/edit form. Allows toggling between "proactive-deps (default)" and "Custom schema" modes. Custom schema mode provides:
- **Guided form:** Fields for root path, name, healthy (with optional equals value for `BooleanComparison`), latency, impact, description
- **Raw JSON editor:** Advanced toggle for power users to edit the `SchemaMapping` JSON directly
- **Test mapping button:** Calls `POST /api/services/test-schema` to preview parsed results from a live endpoint
- **Preview table:** Shows parsed dependencies with health status, latency, and impact

Client-side types for schema mapping (`SchemaMapping`, `BooleanComparison`, `FieldMapping`, `TestSchemaResult`) in `/client/src/types/service.ts`. API function `testSchemaMapping()` in `/client/src/api/services.ts`. Both `CreateServiceInput` and `UpdateServiceInput` include optional `schema_config` field.

## Alert Channel Management UI

`AlertChannels` component (`/client/src/components/pages/Teams/AlertChannels.tsx`) provides CRUD for team alert channels on the team detail page. Team leads and admins can create/edit/delete channels, toggle enable/disable, and send test alerts. Supports Slack webhook and generic HTTP webhook (with custom headers and method selection). Client-side validation for Slack URL format and valid URL. Uses `useAlertChannels` hook (`/client/src/hooks/useAlertChannels.ts`) and API client (`/client/src/api/alerts.ts`). Types in `/client/src/types/alert.ts`.

## Chart Components

Reusable chart components in `/client/src/components/Charts/` for visualizing dependency health and latency trends. Built with `recharts`.

- `LatencyChart` — Line chart showing min/avg/max latency over time. Fetches time-bucketed data from `/api/latency/:id/buckets`. Supports 1h/6h/24h/7d/30d ranges. Custom tooltip with data point count.
- `HealthTimeline` — Horizontal swimlane bar showing health state periods (green=healthy, red=unhealthy, gray=unknown). Fetches transitions from `/api/dependencies/:id/timeline`. Supports 24h/7d/30d ranges. Tooltip shows state, time range, and duration on hover.
- `TimeRangeSelector` — Reusable button group for selecting time ranges. Persists selection to localStorage via configurable `storageKey` prop.

Chart colors use CSS custom properties (`--color-chart-min`, `--color-chart-avg`, `--color-chart-max`) defined in `client/src/index.css` with dark mode variants. Types in `/client/src/types/chart.ts`. API functions in `/client/src/api/latency.ts` (`fetchLatencyBuckets`) and `/client/src/api/timeline.ts` (`fetchHealthTimeline`).

**Integration:** Charts are integrated into the service detail page (`ServiceDetail.tsx`) as collapsible per-dependency panels showing both `LatencyChart` and `HealthTimeline`. The dashboard (`Dashboard.tsx`) shows a health distribution bar with percentage healthy, stacked color-coded segments, and a legend with counts per category. Charts are self-contained — they handle their own data fetching, loading, error, and empty states internally.

## Alert Rules & History UI

`AlertRules` component (`/client/src/components/pages/Teams/AlertRules.tsx`) provides alert rule configuration on the team detail page. Team leads and admins see an editable form with severity filter dropdown (Critical only / Warning and above / All status changes) and enable/disable toggle with save button. Team members see a read-only summary. Uses `useAlertRules` hook (`/client/src/hooks/useAlertRules.ts`).

`AlertHistory` component (`/client/src/components/pages/Teams/AlertHistory.tsx`) displays the last 50 alerts in reverse chronological order with columns: time, service, dependency, event type, delivery status (sent/failed/suppressed), and channel type. Includes status filter dropdown. Handles missing/malformed payloads gracefully. Uses `useAlertHistory` hook (`/client/src/hooks/useAlertHistory.ts`).

## API Routes

- `/api/auth` - Authentication (OIDC or local). `GET /api/auth/mode` returns `{ mode }`. `POST /api/auth/login` for local credentials.
- `/api/services` - CRUD + manual polling (team-scoped: non-admin users see only their team's services; mutations require team lead+; poll requires team membership). `POST /api/services/test-schema` tests a schema mapping against a live URL (team lead+ or admin, SSRF-protected, does not store anything).
- `/api/teams` - CRUD + member management
- `/api/users` - Admin user management. `POST /api/users` creates a local user and `PUT /api/users/:id/password` resets password (both require `requireAdmin` + `requireLocalAuth`)
- `/api/aliases` - Dependency alias CRUD (admin only for mutations) + canonical name lookup
- `/api/dependencies/:id/associations` - Association CRUD (team membership required for mutations)
- `/api/associations/suggestions` - Auto-suggestion management (team membership required for accept/dismiss)
- `/api/graph` - Dependency graph data
- `/api/latency/:id` - Latency history (24h stats + recent data points)
- `/api/latency/:id/buckets` - Time-bucketed latency data for charts. Query param `range`: `1h`, `6h`, `24h` (default), `7d`, `30d`. Bucket sizes: 1h/6h→1min, 24h→15min, 7d→1hr, 30d→6hr.
- `/api/errors/:id` - Error history
- `/api/dependencies/:id/timeline` - Health state timeline. Query param `range`: `24h` (default), `7d`, `30d`. Returns state transitions derived from error history.
- `/api/admin/audit-log` - Audit log query (admin only, filterable by date range, user, action, resource type)
- `/api/admin/settings` - Admin settings CRUD (admin only, GET returns all settings with defaults, PUT updates settings)
- `/api/teams/:id/alert-channels` - Team alert channel CRUD (GET: team member+, POST/PUT/DELETE: team lead+). `POST /:channelId/test` sends a test alert. Supports Slack webhook and generic HTTP webhook channel types.
- `/api/teams/:id/alert-rules` - Team alert rule get/upsert (GET: team member+, PUT: team lead+). Severity filter: `critical`, `warning`, `all`.
- `/api/teams/:id/alert-history` - Team alert history (GET: team member+). Paginated with `limit`, `offset`, and `status` filter (`sent`, `failed`, `suppressed`).

## Documentation

- `README.md` — Project overview, quickstart, features, architecture, configuration
- `docs/installation.md` — Docker, Docker Compose, bare Node.js, reverse proxy, backups
- `docs/admin-guide.md` — First-run setup, user/team management, alerts, admin settings, troubleshooting
- `docs/api-reference.md` — All REST API endpoints with request/response schemas and curl examples
- `docs/health-endpoint-spec.md` — Proactive-deps format, custom schema mapping guide, examples (Spring Boot, ASP.NET), testing guide
- `docs/testing-with-keycloak.md` — Local Keycloak OIDC testing setup, Docker Compose quick start, test users, troubleshooting
- `docs/testing-with-auth0.md` — Auth0 account setup, app registration, env vars, login flow walkthrough, troubleshooting
- `docs/spec/` — Technical specification (13 sections) — see `docs/spec/index.md` for topic map
- `docs/implementation-plan.md` — 1.0 story tracker with Linear ticket references

## General Guidance

- Unless answers are already specified, always ask clarifying questions when there are decisions to be made.
- When encountering important decisions regarding **file structure**, **infrastructure**, **UI behavior**, or other architectural concerns, always:
  1. Pause and ask for direction
  2. Present the available options with pros/cons
  3. Wait for confirmation before proceeding

## Linear Workflow

When working on a Linear ticket:
1. Set the issue status to "In Progress" when starting work
2. Upon completing the work, update the issue status to "Done" (or the appropriate completed state)
3. Add a brief comment summarizing what was done if the changes differ from the original requirements

Always update the ticket status - do not leave tickets in "In Progress" after completing work.

## Linear Issue Template

When creating or updating Linear issues for this project, use this structure:

### Title Format
`[Area] Brief action-oriented description`

Examples:
- `[API] Add endpoint for fetching dependency versions`
- `[UI] Create dependency table component`
- `[Bug] Fix pagination in services list`

### Description Structure

```markdown
## Context
Why this work is needed. Link to related issues or discussions if applicable.

## Requirements
- [ ] Specific deliverable 1
- [ ] Specific deliverable 2
- [ ] Specific deliverable 3

## Technical Notes
Implementation details, constraints, or architectural decisions relevant to this work.
Optional - include only when helpful.

## Out of Scope
What this issue explicitly does NOT cover (if clarification is needed).
```

### Labels
Apply relevant labels:
- `bug` - Something isn't working
- `feature` - New functionality
- `enhancement` - Improvement to existing functionality
- `tech-debt` - Refactoring or cleanup
- `documentation` - Documentation updates

### Linking
- Use `blocks` for issues that must complete before others can start
- Use `blocked by` for dependencies on other issues
- Use `related to` for contextually connected work
