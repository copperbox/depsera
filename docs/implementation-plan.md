# Depsera 1.0 — Implementation Plan

> **Source documents:** [PRD-1.0](./PRD-1.0.md) | [Technical Spec](./spec.md)
> **Linear project:** Proactive-dependency-monitoring (PRO-*)
> **Total stories:** 41 (+ 1 shared: PRO-55)
> **Date:** 2026-02-20

---

## How to Use This Document

Each story below includes:
- **Linear ref** — the ticket identifier (link format: search `PRO-XXX` in Linear)
- **Blocked by** — stories that must be completed first
- **Scope** — what the story delivers
- **Acceptance criteria** — how to verify it's done
- **Files likely touched** — starting points for implementation

Stories within a phase can be worked in parallel unless a blocking relationship is noted. Sequential dependencies within a split are marked with `->`.

---

## Phase 1: Security Hardening

**Goal:** Establish a production-trustworthy security baseline. No feature dependencies — all stories can be worked simultaneously (except 1.7b which depends on 1.7a).

### 1.1 — Whitelist ORDER BY columns in store queries
**Linear:** [PRO-67](https://linear.app/team/PRO-67)
**Blocked by:** None
**Scope:** Add a whitelist of allowed column names per store. Reject anything not on the list in `orderBy`/`orderDirection` parameters. Covers: ServiceStore, UserStore, DependencyStore, TeamStore, AssociationStore, LatencyHistoryStore, ErrorHistoryStore.

**Acceptance criteria:**
- [x] Each store defines an explicit set of allowed ORDER BY columns
- [x] Passing a non-whitelisted column throws/returns 400
- [x] Existing sort functionality continues to work
- [x] Tests cover valid and invalid column names

**Files likely touched:**
- `server/src/stores/impl/*.ts` — all store implementations
- `server/src/stores/interfaces/*.ts` — type updates if needed
- `server/src/__tests__/stores/` — new tests per store

---

### 1.2a — Fix IDOR on association routes
**Linear:** [PRO-91](https://linear.app/team/PRO-91)
**Blocked by:** None
**Scope:** Association routes only check `requireAuth` but don't verify the user has access to the specific dependency's owning service/team. Add team ownership verification before creating/deleting associations.

**Acceptance criteria:**
- [x] Creating an association checks that the user is a member (lead+) of the dependency's owning team, or is admin
- [x] Deleting an association checks the same
- [x] Returns 403 for unauthorized access
- [x] Tests cover authorized and unauthorized cases

**Files likely touched:**
- `server/src/routes/associations.ts`
- `server/src/middleware/auth.ts` — possibly extend `requireTeamAccess`
- `server/src/__tests__/routes/associations.test.ts`

---

### 1.2b — Fix IDOR on alias routes — restrict to admin
**Linear:** [PRO-92](https://linear.app/team/PRO-92)
**Blocked by:** None
**Scope:** Add `requireAdmin` middleware to alias create/update/delete. Keep read endpoints accessible to all authenticated users.

**Acceptance criteria:**
- [x] `POST /api/aliases`, `PUT /api/aliases/:id`, `DELETE /api/aliases/:id` require admin role
- [x] `GET /api/aliases`, `GET /api/aliases/canonical-names` remain `requireAuth`
- [x] Non-admin mutation attempts return 403
- [x] Tests updated

**Files likely touched:**
- `server/src/routes/aliases.ts`
- `server/src/__tests__/routes/aliases.test.ts`

---

### 1.3 — Sanitize error messages returned to clients
**Linear:** [PRO-68](https://linear.app/team/PRO-68)
**Blocked by:** None
**Scope:** Create a sanitized error response utility. Replace all raw `error.message` usage in route handlers. Sanitize stored poll error messages to strip internal URLs/IPs.

**Acceptance criteria:**
- [x] New utility: `sanitizeErrorMessage(error)` strips internal details
- [x] All route handler catch blocks use the utility instead of raw `error.message`
- [x] Poll error messages stored in `services.last_poll_error` are sanitized before storage
- [x] 500 responses never expose stack traces, internal paths, or private IPs
- [x] Tests verify sanitization works for various error types

**Files likely touched:**
- `server/src/utils/errors.ts` — `sendErrorResponse()`, `sanitizePollError()`, updated `formatError()`
- `server/src/routes/**/*.ts` — all 27 route handler catch blocks
- `server/src/services/polling/ServicePoller.ts`
- `server/src/utils/errors.test.ts` — 52 tests

---

### 1.4 — Harden auth bypass configuration
**Linear:** [PRO-69](https://linear.app/team/PRO-69)
**Blocked by:** None
**Scope:** Default `AUTH_BYPASS=false` in `.env.example`. Remove committed `.env` from repo (add to `.gitignore`). Add startup warning when bypass is active. Block bypass in production.

**Acceptance criteria:**
- [ ] `.env.example` has `AUTH_BYPASS=false` as default
- [ ] `server/.env` removed from git tracking (added to `.gitignore`)
- [ ] Server logs a visible warning at startup when `AUTH_BYPASS=true`
- [ ] `AUTH_BYPASS=true` + `NODE_ENV=production` throws on startup (verify existing guard)
- [ ] Login route also guards against bypass in production
- [ ] Tests cover all modes

**Files likely touched:**
- `server/.env.example`
- `server/.gitignore`
- `server/src/auth/` — bypass setup
- `server/src/routes/auth.ts`

---

### 1.5 — Improve session cookie security
**Linear:** [PRO-70](https://linear.app/team/PRO-70)
**Blocked by:** None
**Scope:** Evaluate `sameSite: 'strict'` against OIDC callback flow (OIDC callback is a cross-origin redirect, so `strict` may break it — document finding). Add startup warning if `secure` is false outside dev. Explicit cookie path scoping.

**Acceptance criteria:**
- [ ] `sameSite` setting documented with rationale (strict vs lax for OIDC)
- [ ] Startup warning logged if `secure` is false and `NODE_ENV !== 'development'`
- [ ] Cookie path explicitly set to `/`
- [ ] Tests cover session configuration

**Files likely touched:**
- `server/src/auth/session.ts`

---

### 1.6a — Minor server-side hardening
**Linear:** [PRO-95](https://linear.app/team/PRO-95)
**Blocked by:** None
**Scope:** Timing-safe OIDC state comparison, explicit body size limits on `express.json()`, session destroy error handling, SQLite WAL pragmas, `eslint-plugin-security` for server.

**Acceptance criteria:**
- [ ] OIDC state parameter compared using `crypto.timingSafeEqual`
- [ ] `express.json({ limit: '100kb' })` (or similar explicit limit)
- [ ] `req.session.destroy()` error is handled (logged, not swallowed)
- [ ] SQLite WAL mode pragma set explicitly in database initialization
- [ ] `eslint-plugin-security` added to server ESLint config, any findings fixed
- [ ] Tests for each change

**Files likely touched:**
- `server/src/routes/auth.ts` — timing-safe comparison
- `server/src/app.ts` or `server/src/middleware/` — body size limits
- `server/src/db/database.ts` — WAL pragma
- `server/.eslintrc.*` — eslint plugin
- `server/package.json`

---

### 1.6b — Minor client-side hardening
**Linear:** [PRO-96](https://linear.app/team/PRO-96)
**Blocked by:** None
**Scope:** Use `URLSearchParams` for query parameter encoding, validate localStorage JSON parsing (wrap in try/catch), add `eslint-plugin-security` for client.

**Acceptance criteria:**
- [ ] All query string construction uses `URLSearchParams` (no manual `?key=value` concatenation)
- [ ] All `JSON.parse(localStorage.getItem(...))` calls wrapped in try/catch
- [ ] `eslint-plugin-security` added to client ESLint config, any findings fixed
- [ ] Tests where applicable

**Files likely touched:**
- `client/src/api/*.ts` — query parameter construction
- `client/src/hooks/*.ts` — localStorage reads
- `client/src/contexts/*.ts` — localStorage reads
- `client/.eslintrc.*`
- `client/package.json`

---

### 1.7a — HTTP request logging middleware
**Linear:** [PRO-93](https://linear.app/team/PRO-93)
**Blocked by:** None
**Scope:** Install `pino` + `pino-http`. Log method, path, status code, response time, user ID. Structured JSON in production, readable format in development. Configurable via `LOG_LEVEL` env var.

**Acceptance criteria:**
- [x] `pino` and `pino-http` installed
- [x] All HTTP requests logged with: method, path, status, response time, user ID (from session)
- [x] `NODE_ENV=production` outputs JSON; development outputs pretty-printed
- [x] `LOG_LEVEL` env var controls log level (default: `info`)
- [x] Health check endpoint (`/api/health`) is optionally quieted (not logged at info level)
- [x] Tests verify logging middleware is wired in

**Files likely touched:**
- `server/package.json` — new dependencies
- `server/src/utils/logger.ts` (new)
- `server/src/middleware/requestLogger.ts` (new)
- `server/src/index.ts` — middleware registration
- `server/.env.example` — `LOG_LEVEL`

---

### 1.7b — Admin action audit trail
**Linear:** [PRO-94](https://linear.app/team/PRO-94)
**Blocked by:** PRO-93
**Scope:** Create `audit_log` table and AuditLogStore. Log admin actions (role changes, user deactivation, team/service CRUD). `GET /api/admin/audit-log` endpoint (admin only).

**Acceptance criteria:**
- [x] Migration creates `audit_log` table (id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
- [x] `IAuditLogStore` interface + `AuditLogStore` implementation
- [x] Store registered in `StoreRegistry`
- [x] Admin actions in user, team, and service routes write audit entries
- [x] `GET /api/admin/audit-log` returns paginated audit entries (admin only)
- [x] Audit log entries subject to data retention cleanup (via `deleteOlderThan`)
- [x] Tests for store, route, and audit logging

**Files likely touched:**
- `server/src/db/migrations/008_add_audit_log.ts` (new)
- `server/src/stores/interfaces/IAuditLogStore.ts` (new)
- `server/src/stores/impl/SQLiteAuditLogStore.ts` (new)
- `server/src/stores/index.ts`
- `server/src/routes/admin.ts` (new or extend)
- `server/src/routes/users.ts`, `teams.ts`, `services.ts` — audit calls
- `server/src/db/types.ts`

---

## Phase 2: Access Control & Core Infrastructure

**Goal:** Build foundational systems that later features depend on.

### 2.1a — Server team-scoped service API filtering and authorization
**Linear:** [PRO-97](https://linear.app/team/PRO-97)
**Blocked by:** PRO-91, PRO-92
**Scope:** Modify service routes so `GET /api/services` returns only the requesting user's team services (unless admin). Service create/edit/delete restricted to team members (team lead+) of the owning team. Graph, wallboard, and dashboard endpoints continue to return ALL services org-wide.

**Acceptance criteria:**
- [x] `GET /api/services` filters by user's team memberships (non-admin)
- [x] Admin users see all services
- [x] Service create/edit/delete restricted to owning team's lead or admin
- [x] `GET /api/graph`, wallboard, and dashboard data remain org-wide
- [x] Tests cover admin bypass, team lead access, member access, non-member rejection

**Files likely touched:**
- `server/src/routes/services.ts`
- `server/src/stores/impl/SQLiteServiceStore.ts` — new query variant or parameter
- `server/src/middleware/auth.ts` — possibly extend team check helpers

---

### 2.1b — Update client service list for team-scoped results
**Linear:** [PRO-98](https://linear.app/team/PRO-98)
**Blocked by:** PRO-97
**Scope:** Adjust team filter dropdown behavior (may now be redundant or simplified for non-admins), update empty states, verify graph/wallboard/dashboard remain unaffected.

**Acceptance criteria:**
- [x] Service list reflects team-scoped API response
- [x] Team filter dropdown still works (admin sees all, users see their teams)
- [x] Empty state shown when user has no team services
- [x] Graph, wallboard, dashboard render unchanged
- [x] Tests updated

**Files likely touched:**
- `client/src/hooks/useServicesList.ts`
- `client/src/pages/ServicesList.tsx`
- `client/src/components/` — empty state component

---

### 2.2 — Data retention system
**Linear:** [PRO-74](https://linear.app/team/PRO-74)
**Blocked by:** None
**Scope:** Background job scheduler for cleaning up old latency and error history. Default 365 days, configurable via `DATA_RETENTION_DAYS` env var.

**Acceptance criteria:**
- [x] Scheduled cleanup runs daily at configurable time (default 02:00 local)
- [x] Deletes rows from `dependency_latency_history` and `dependency_error_history` older than retention period
- [x] Configurable via `DATA_RETENTION_DAYS` env var (default: 365)
- [x] Logs number of rows deleted per table
- [x] Cleanup runs on startup if overdue
- [x] Graceful shutdown stops the scheduler
- [x] Tests for cleanup logic and scheduling

**Files likely touched:**
- `server/src/services/retention/DataRetentionService.ts` (new)
- `server/src/index.ts` — startup/shutdown
- `server/.env.example` — new env vars
- Tests

---

### 2.3 — Admin settings backend
**Linear:** [PRO-75](https://linear.app/team/PRO-75)
**Blocked by:** None
**Scope:** `settings` key-value table, store, API routes, in-memory cache. Env vars serve as initial defaults; admin settings override at runtime.

**Acceptance criteria:**
- [x] Migration creates `settings` table (key TEXT PK, value TEXT, updated_at, updated_by)
- [x] `ISettingsStore` interface + `SQLiteSettingsStore` implementation
- [x] In-memory settings cache, refreshed on update
- [x] `GET /api/settings` (admin only) returns all settings
- [x] `PUT /api/settings` (admin only) updates settings
- [x] Settings keys: `data_retention_days`, `retention_cleanup_time`, `default_poll_interval_ms`, `ssrf_allowlist`, `global_rate_limit`, `global_rate_limit_window_minutes`, `auth_rate_limit`, `auth_rate_limit_window_minutes`
- [x] Env vars provide initial defaults; DB values override
- [x] Tests for store, caching, and routes

**Files likely touched:**
- `server/src/db/migrations/009_add_settings.ts` (new)
- `server/src/stores/interfaces/ISettingsStore.ts` (new)
- `server/src/stores/impl/SettingsStore.ts` (new)
- `server/src/stores/index.ts`
- `server/src/services/settings/SettingsService.ts` (new) — cache layer
- `server/src/routes/admin/settings.ts` (new)
- `server/src/db/types.ts`

---

## Phase 3: Admin Settings UI & Local Auth

**Goal:** User-facing admin configuration and an alternative auth mode for standalone deployments.

### 3.1 — Admin settings page
**Linear:** [PRO-76](https://linear.app/team/PRO-76)
**Blocked by:** PRO-75
**Scope:** Admin-only UI at `/admin/settings` with sections: Data Retention, Polling Defaults, Security (SSRF allowlist, rate limits). Form validation with save confirmation. Settings take effect immediately.

**Acceptance criteria:**
- [x] New route `/admin/settings` accessible to admin users only
- [x] Sections: Data Retention, Polling Defaults, Security
- [x] Form loads current values from `GET /api/settings`
- [x] Saves via `PUT /api/settings` with validation
- [x] Success/error feedback shown to user
- [x] Admin nav link added (alongside Users)
- [x] Tests for the settings page component

**Files likely touched:**
- `client/src/components/pages/Admin/AdminSettings.tsx` (new)
- `client/src/api/settings.ts` (new)
- `client/src/App.tsx` — route registration
- `client/src/components/Layout/Layout.tsx` — admin nav links

---

### 3.2a — Local auth backend
**Linear:** [PRO-99](https://linear.app/team/PRO-99)
**Blocked by:** PRO-97
**Scope:** `LOCAL_AUTH=true` enables local auth. Migration adds `password_hash` column to `users`. Initial admin from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars. `POST /api/auth/login` for credentials. `GET /api/auth/mode` returns auth mode.

**Acceptance criteria:**
- [x] Migration adds nullable `password_hash TEXT` column to `users`
- [x] `LOCAL_AUTH=true` enables local auth; mutually exclusive with `AUTH_BYPASS`
- [x] On first startup with `LOCAL_AUTH=true`: creates admin from env vars
- [x] `POST /api/auth/login` accepts `{ email, password }`, returns session
- [x] `GET /api/auth/mode` returns `{ mode: "oidc" | "local" | "bypass" }`
- [x] Passwords stored with bcrypt (minimum 12 rounds)
- [x] Tests for login, mode endpoint, mutual exclusion

**Files touched:**
- `server/src/db/migrations/010_add_password_hash.ts` (new)
- `server/src/auth/localAuth.ts` (new)
- `server/src/routes/auth/localLogin.ts` (new)
- `server/src/routes/auth/mode.ts` (new)
- `server/src/routes/auth/index.ts` — new endpoints
- `server/src/routes/auth/login.ts` — local mode redirect
- `server/src/routes/auth/logout.ts` — local mode handling
- `server/src/stores/interfaces/IUserStore.ts` — `updatePasswordHash` method
- `server/src/stores/impl/UserStore.ts` — password_hash in create + updatePasswordHash
- `server/src/db/types.ts` — password_hash on User type
- `server/src/index.ts` — local auth validation and bootstrap
- `server/package.json` — `bcryptjs`

---

### 3.2b — Local auth login page
**Linear:** [PRO-100](https://linear.app/team/PRO-100)
**Blocked by:** PRO-99
**Scope:** Client calls `/api/auth/mode` to determine mode, shows username/password form or OIDC redirect button accordingly.

**Acceptance criteria:**
- [x] Login page calls `GET /api/auth/mode` on mount
- [x] `mode: "local"` shows username/password form
- [x] `mode: "oidc"` shows existing OIDC redirect button
- [x] Form submits to `POST /api/auth/login`
- [x] Error handling for invalid credentials
- [x] Tests for both modes

**Files touched:**
- `client/src/components/Login/Login.tsx`
- `client/src/api/auth.ts` (new)
- `client/src/api/auth.test.ts` (new)
- `client/src/components/Login/Login.test.tsx`
- `client/src/App.test.tsx`

---

### 3.2c — Admin local user management
**Linear:** [PRO-101](https://linear.app/team/PRO-101)
**Blocked by:** PRO-99
**Scope:** Admin can create local users and reset passwords via API + UI (only visible in local auth mode).

**Acceptance criteria:**
- [x] `POST /api/users` creates a local user (admin only, local auth mode only)
- [x] `PUT /api/users/:id/password` resets password (admin only, local auth mode only)
- [x] Admin user management page shows create user form in local auth mode
- [x] Password reset action available per user in local auth mode
- [x] Tests for new endpoints and UI

**Files likely touched:**
- `server/src/routes/users.ts`
- `client/src/pages/UserManagement.tsx`
- `client/src/api/users.ts`

---

### 3.3a — Automated OIDC integration tests
**Linear:** [PRO-102](https://linear.app/team/PRO-102)
**Blocked by:** PRO-98
**Scope:** Use `oidc-provider` (Node.js) as in-process OIDC server for automated integration tests.

**Acceptance criteria:**
- [ ] `oidc-provider` installed as dev dependency
- [ ] Tests cover: login redirect, callback token exchange, user creation/sync, session establishment, logout, first-user admin bootstrap, error handling
- [ ] Tests run in CI without external services
- [ ] All tests pass

**Files likely touched:**
- `server/package.json` — `oidc-provider` dev dependency
- `server/src/__tests__/integration/oidc.test.ts` (new)
- `server/src/__tests__/helpers/oidcProvider.ts` (new) — test OIDC server setup

---

### 3.3b — OIDC manual testing infrastructure
**Linear:** [PRO-103](https://linear.app/team/PRO-103)
**Blocked by:** PRO-102
**Scope:** Docker Compose profile with Keycloak for manual E2E testing + Okta testing guide.

**Acceptance criteria:**
- [ ] `docker-compose.testing.yml` with Keycloak service and pre-configured realm
- [ ] Realm includes a test client matching Depsera's OIDC config
- [ ] `docs/testing-with-keycloak.md` with setup instructions
- [ ] `docs/testing-with-okta.md` guide for Okta testing

**Files likely touched:**
- `docker-compose.testing.yml` (new)
- `keycloak/` — realm export JSON (new)
- `docs/testing-with-keycloak.md` (new)
- `docs/testing-with-okta.md` (new)

---

### 3.4 — Dockerfile and Docker Compose
**Linear:** [PRO-55](https://linear.app/team/PRO-55)
**Blocked by:** PRO-98
**Scope:** Multi-stage Dockerfile, docker-compose.yml, .dockerignore. Defaults to local auth if no OIDC config provided.

**Acceptance criteria:**
- [ ] Multi-stage Dockerfile: build (client + server) -> minimal Node.js runtime
- [ ] `NODE_ENV=production` baked in
- [ ] Internal port 3001
- [ ] SQLite data directory as mountable volume (`/data`)
- [ ] Docker health check: `GET /api/health`
- [ ] `docker-compose.yml` with sensible defaults
- [ ] `.dockerignore` excludes node_modules, .git, etc.
- [ ] Image builds and runs successfully
- [ ] Tests: `docker build` succeeds, container starts and responds to health check

**Files likely touched:**
- `Dockerfile` (new)
- `.dockerignore` (new)
- `docker-compose.yml` (new)

---

## Phase 4: Custom Health Endpoint Schema Support

**Goal:** Enable Depsera to ingest health data from non-proactive-deps services.

### 4.1 — Schema mapping data model
**Linear:** [PRO-78](https://linear.app/team/PRO-78)
**Blocked by:** PRO-97
**Scope:** New `schema_mappings` table or `schema_config` JSON column on `services`. TypeScript types for the schema mapping structure.

**Acceptance criteria:**
- [ ] Migration adds schema config storage (table or column)
- [ ] TypeScript types: `SchemaMapping`, `FieldMapping`, `BooleanComparison`
- [ ] Schema mapping supports: `root` path, direct field mapping, boolean comparison, nested paths
- [ ] Services without a mapping default to proactive-deps
- [ ] Tests for types and migration

**Files likely touched:**
- `server/src/db/migrations/010_add_schema_mappings.ts` (new)
- `server/src/db/types.ts` — new types
- `server/src/stores/` — if separate table, new store

---

### 4.2 — Schema-aware dependency parser
**Linear:** [PRO-79](https://linear.app/team/PRO-79)
**Blocked by:** PRO-78
**Scope:** Refactor `DependencyParser` to accept optional schema mapping. When present, extract fields using the mapping. Otherwise, use existing proactive-deps parser.

**Acceptance criteria:**
- [ ] Parser accepts optional `SchemaMapping` parameter
- [ ] With mapping: extracts fields per mapping config (root path, field mappings, boolean comparisons)
- [ ] Without mapping: existing behavior unchanged (backwards compatible)
- [ ] Validates parsed data has required fields (name, healthy minimum)
- [ ] Malformed responses handled gracefully (log warning, skip dependency)
- [ ] Tests for: proactive-deps, custom schema, missing fields, nested paths, boolean comparisons

**Files likely touched:**
- `server/src/services/polling/DependencyParser.ts` (or new `SchemaMapper.ts`)
- `server/src/services/polling/ServicePoller.ts` — pass schema config
- Tests

---

### 4.3a — Schema mapping test endpoint
**Linear:** [PRO-104](https://linear.app/team/PRO-104)
**Blocked by:** PRO-97
**Scope:** `POST /api/services/test-schema` endpoint for testing a schema mapping against a live URL. SSRF protected. Returns parsed results + warnings.

**Acceptance criteria:**
- [ ] `POST /api/services/test-schema` accepts `{ url, schema_mapping }`
- [ ] Authenticated, team lead+ required
- [ ] Fetches URL, applies schema mapping, returns `{ dependencies, warnings }`
- [ ] SSRF validation on URL
- [ ] Does NOT store anything
- [ ] Tests for valid mapping, invalid URL, SSRF rejection

**Files likely touched:**
- `server/src/routes/services.ts` — new endpoint
- Tests

---

### 4.3b — Schema mapping form on service create/edit
**Linear:** [PRO-105](https://linear.app/team/PRO-105)
**Blocked by:** PRO-104
**Scope:** "Health Endpoint Format" section on service form. Toggle between "proactive-deps (default)" and "Custom schema". Guided form + raw JSON editor. Test button.

**Acceptance criteria:**
- [ ] Service form has "Health Endpoint Format" section
- [ ] Toggle between proactive-deps and custom schema
- [ ] Custom schema mode shows guided form for field mappings
- [ ] "Test mapping" button calls test-schema endpoint, shows preview
- [ ] Advanced toggle for raw JSON editing
- [ ] Validation: name and healthy fields required when custom schema selected
- [ ] Tests for form interactions

**Files likely touched:**
- `client/src/pages/ServiceForm.tsx` (or similar)
- `client/src/components/SchemaMapping/` (new)
- `client/src/api/services.ts`

---

## Phase 5: Alerting

**Goal:** Team-level alert notifications via Slack and webhooks when service health changes.

### 5.1 — Alert configuration data model
**Linear:** [PRO-81](https://linear.app/team/PRO-81)
**Blocked by:** None
**Scope:** Migrations for `alert_channels`, `alert_rules`, `alert_history` tables. Store interfaces and implementations.

**Acceptance criteria:**
- [x] Migration creates all three tables with correct schemas and foreign keys
- [x] `IAlertChannelStore`, `IAlertRuleStore`, `IAlertHistoryStore` interfaces
- [x] SQLite implementations
- [x] Stores registered in `StoreRegistry`
- [x] Alert history subject to data retention cleanup (wire into existing retention service)
- [x] Tests for all store operations

**Files touched:**
- `server/src/db/migrations/011_add_alerts.ts` (new)
- `server/src/stores/interfaces/IAlertChannelStore.ts` (new)
- `server/src/stores/interfaces/IAlertRuleStore.ts` (new)
- `server/src/stores/interfaces/IAlertHistoryStore.ts` (new)
- `server/src/stores/impl/AlertChannelStore.ts` (new)
- `server/src/stores/impl/AlertRuleStore.ts` (new)
- `server/src/stores/impl/AlertHistoryStore.ts` (new)
- `server/src/stores/index.ts`
- `server/src/db/types.ts`
- `server/src/services/retention/DataRetentionService.ts`

---

### 5.2 — Alert dispatch engine
**Linear:** [PRO-82](https://linear.app/team/PRO-82)
**Blocked by:** PRO-81
**Scope:** Listens to polling events (`STATUS_CHANGE`, `POLL_ERROR`). Evaluates alert rules, applies flap protection and rate limiting, dispatches to channels, records in history.

**Acceptance criteria:**
- [x] Subscribes to `status:change` and `poll:error` events
- [x] Evaluates alert rules for the owning team
- [x] Severity matching: only fires for configured severity levels
- [x] Flap protection: suppresses within cooldown window (default 5 min, configurable via admin settings)
- [x] Rate limiting: max N alerts/team/hour (default 30, configurable)
- [x] Dispatches to configured channels (Slack, webhook)
- [x] Records all attempts in `alert_history` (including suppressed)
- [x] Retries failed dispatches once after 30 seconds
- [x] Tests for filtering, flap protection, rate limiting, dispatch, retry

**Files touched:**
- `server/src/services/alerts/AlertService.ts` (new)
- `server/src/services/alerts/FlapProtector.ts` (new)
- `server/src/services/alerts/AlertRateLimiter.ts` (new)
- `server/src/services/alerts/types.ts` (new)
- `server/src/services/alerts/index.ts` (new)
- `server/src/services/index.ts` — barrel export
- `server/src/index.ts` — startup/shutdown wiring

---

### 5.3 — Slack integration
**Linear:** [PRO-83](https://linear.app/team/PRO-83)
**Blocked by:** PRO-82
**Scope:** Slack message formatter using Block Kit. HTTP sender to incoming webhook URL. Requires `APP_BASE_URL` for deep links.

**Acceptance criteria:**
- [x] Slack messages include: service name, dependency name, old -> new status, timestamp, link to Depsera
- [x] Uses Slack Block Kit for rich formatting
- [x] `APP_BASE_URL` env var for deep links
- [x] HTTP POST to webhook URL with 10s timeout
- [x] Tests for message formatting and sending

**Files touched:**
- `server/src/services/alerts/senders/SlackSender.ts` (new)
- `server/src/services/alerts/senders/SlackSender.test.ts` (new)
- `server/src/services/alerts/index.ts` — export SlackSender
- `server/src/index.ts` — register SlackSender on startup
- `server/.env.example` — `APP_BASE_URL`

---

### 5.4 — Webhook integration
**Linear:** [PRO-84](https://linear.app/team/PRO-84)
**Blocked by:** PRO-82
**Scope:** Generic HTTP webhook. JSON payload, configurable headers, 10s timeout.

**Acceptance criteria:**
- [x] POST JSON payload: `{ event, service, dependency, oldStatus, newStatus, timestamp, severity }`
- [x] Configurable custom headers (for auth tokens, API keys)
- [x] 10-second timeout
- [x] Response status recorded in alert history
- [x] Tests for payload formatting, header injection, timeout handling

**Files touched:**
- `server/src/services/alerts/senders/WebhookSender.ts` (new)
- `server/src/services/alerts/senders/WebhookSender.test.ts` (new)
- `server/src/routes/alerts/validation.ts` — added optional `method` field to webhook config
- `server/src/index.ts` — register WebhookSender on startup

---

### 5.5a — Alert channel, rules, and history API routes
**Linear:** [PRO-106](https://linear.app/team/PRO-106)
**Blocked by:** PRO-97
**Scope:** CRUD endpoints for alert channels and rules (team-scoped). Alert history listing. Team membership verification.

**Acceptance criteria:**
- [x] `POST/GET/PUT/DELETE /api/teams/:teamId/alert-channels` — CRUD (team lead+)
- [x] `POST /api/teams/:teamId/alert-channels/:id/test` — send test alert
- [x] `POST/GET/PUT/DELETE /api/teams/:teamId/alert-rules` — CRUD (team lead+)
- [x] `GET /api/teams/:teamId/alert-history` — paginated history (team member+)
- [x] Input validation on all endpoints
- [x] Tests for all endpoints

**Files touched:**
- `server/src/routes/alerts/` (new) — index, channels/, rules/, history/, validation
- `server/src/index.ts` — route registration

---

### 5.5b — Alert channel management UI
**Linear:** [PRO-107](https://linear.app/team/PRO-107)
**Blocked by:** PRO-106
**Scope:** UI on team detail page for creating, editing, testing, and deleting alert channels.

**Acceptance criteria:**
- [x] Channel list with type, status, enable/disable toggle
- [x] Create channel form (Slack webhook URL or generic webhook URL + headers)
- [x] Edit existing channels
- [x] Test channel button sends test alert
- [x] Delete confirmation
- [x] Tests for component

**Files likely touched:**
- `client/src/components/pages/Teams/AlertChannels.tsx` (new)
- `client/src/components/pages/Teams/AlertChannels.module.css` (new)
- `client/src/components/pages/Teams/AlertChannels.test.tsx` (new)
- `client/src/hooks/useAlertChannels.ts` (new)
- `client/src/api/alerts.ts` (new)
- `client/src/types/alert.ts` (new)
- `client/src/components/pages/Teams/TeamDetail.tsx` — integrated AlertChannels section
- `client/src/api/alerts.ts` (new)

---

### 5.5c — Alert rules configuration and history view
**Linear:** [PRO-108](https://linear.app/team/PRO-108)
**Blocked by:** PRO-106
**Scope:** UI for severity rules and alert history viewing per team.

**Acceptance criteria:**
- [ ] Severity filter dropdown (critical, warning, all)
- [ ] Enable/disable toggle for rules
- [ ] Alert history table with columns: time, service, dependency, status change, delivery status
- [ ] Status filter on history (sent, failed, suppressed)
- [ ] Tests for component

**Files likely touched:**
- `client/src/components/AlertRules/` (new)
- `client/src/components/AlertHistory/` (new)
- `client/src/pages/TeamDetail.tsx`

---

## Phase 6: Metrics History Charts

**Goal:** Visualize dependency health and latency trends from existing SQLite data.

### 6.1 — Latency history and health timeline API enhancements
**Linear:** [PRO-86](https://linear.app/team/PRO-86)
**Blocked by:** None
**Scope:** Enhanced `GET /api/latency/:dependencyId` with `range` parameter for time-bucketed data. New `GET /api/dependencies/:id/timeline` for health state transitions.

**Acceptance criteria:**
- [ ] `GET /api/latency/:dependencyId?range=1h|6h|24h|7d|30d` returns `{ timestamp, min, avg, max, count }` buckets
- [ ] Bucket sizes: 1h/6h -> 1min, 24h -> 15min, 7d -> 1hr, 30d -> 6hr
- [ ] `GET /api/dependencies/:id/timeline?range=24h|7d|30d` returns health state transitions
- [ ] Efficient SQLite aggregation queries (not fetching all rows into app)
- [ ] Tests for each range, edge cases (no data, single point)

**Files likely touched:**
- `server/src/routes/latency.ts`
- `server/src/routes/dependencies.ts` (or new timeline route)
- `server/src/stores/impl/SQLiteLatencyHistoryStore.ts` — aggregation queries
- `server/src/stores/interfaces/ILatencyHistoryStore.ts`

---

### 6.2 — Chart components
**Linear:** [PRO-87](https://linear.app/team/PRO-87)
**Blocked by:** PRO-86
**Scope:** Install Recharts. Create latency line chart (min/avg/max), health timeline swimlane, reusable time range selector.

**Acceptance criteria:**
- [ ] `recharts` installed
- [ ] `LatencyChart` component: line chart with min/avg/max lines, tooltips
- [ ] `HealthTimeline` component: horizontal swimlane (green/yellow/red periods)
- [ ] `TimeRangeSelector` component: 1h, 6h, 24h, 7d, 30d buttons
- [ ] All components handle empty data gracefully
- [ ] Responsive (works on various screen widths)
- [ ] Tests for each component

**Files likely touched:**
- `client/package.json` — `recharts`
- `client/src/components/Charts/LatencyChart.tsx` (new)
- `client/src/components/Charts/HealthTimeline.tsx` (new)
- `client/src/components/Charts/TimeRangeSelector.tsx` (new)

---

### 6.3 — Integrate charts into views
**Linear:** [PRO-88](https://linear.app/team/PRO-88)
**Blocked by:** PRO-87
**Scope:** Add charts to service detail page (per dependency) and dashboard (aggregate health %). Auto-refresh with existing polling interval.

**Acceptance criteria:**
- [ ] Service detail page shows latency chart + health timeline per dependency
- [ ] Dashboard shows aggregate health chart (% healthy over time)
- [ ] Charts auto-refresh with the page's existing polling interval
- [ ] Empty state when no historical data
- [ ] Tests for integration

**Files likely touched:**
- `client/src/pages/ServiceDetail.tsx`
- `client/src/pages/Dashboard.tsx`
- `client/src/hooks/useLatencyChart.ts` (new)
- `client/src/api/latency.ts` — updated calls

---

## Phase 7: Deployment, Documentation & Release

**Goal:** Production-ready deployment artifacts and comprehensive documentation.

### 7.1 — Dockerfile and Docker Compose
> **Note:** This is the same story as Phase 3.4 (PRO-55). Listed here for completeness. Work is done in Phase 3.

---

### 7.2a — Legal and community files
**Linear:** [PRO-109](https://linear.app/team/PRO-109)
**Blocked by:** PRO-81
**Scope:** Apache 2.0 license, CLA, CONTRIBUTING.md, CODE_OF_CONDUCT.md, GitHub issue/PR templates.

**Acceptance criteria:**
- [ ] `LICENSE` — Apache 2.0
- [ ] `CLA.md` — Contributor License Agreement
- [ ] `CONTRIBUTING.md` — dev setup, code style, PR process, CLA requirement
- [ ] `CODE_OF_CONDUCT.md` — Contributor Covenant
- [ ] `.github/ISSUE_TEMPLATE/bug_report.md`
- [ ] `.github/ISSUE_TEMPLATE/feature_request.md`
- [ ] `.github/PULL_REQUEST_TEMPLATE.md`

**Files likely touched:** All listed above (new files)

---

### 7.2b — Squash git history and create release tag
**Linear:** [PRO-110](https://linear.app/team/PRO-110)
**Blocked by:** PRO-109 (and all other stories — this is the VERY LAST task)
**Scope:** Clean git history for public release. Verify no secrets in history. Create `v1.0.0` tag.

**Acceptance criteria:**
- [ ] Git history squashed/cleaned for public consumption
- [ ] No secrets, credentials, or sensitive data in any commit
- [ ] `v1.0.0` tag created with release notes
- [ ] Verified with `git log`, `git secrets --scan-history` or similar

---

### 7.3a — Installation guide and configuration reference
**Linear:** [PRO-111](https://linear.app/team/PRO-111)
**Blocked by:** PRO-55
**Scope:** Docker quickstart, Docker Compose setup, bare Node.js deployment guide, reverse proxy examples (nginx, Caddy), complete env var reference, backup procedures.

**Acceptance criteria:**
- [ ] `docs/installation.md` with Docker quickstart, Docker Compose, bare Node.js options
- [ ] Reverse proxy examples (nginx, Caddy) with SSL termination
- [ ] Complete env var reference table
- [ ] SQLite backup procedures
- [ ] All instructions tested end-to-end

---

### 7.3b — Health endpoint spec and custom schema guide
**Linear:** [PRO-112](https://linear.app/team/PRO-112)
**Blocked by:** PRO-105
**Scope:** Document proactive-deps format, custom schema mapping guide with examples for common formats (Spring Boot Actuator, ASP.NET health checks).

**Acceptance criteria:**
- [ ] `docs/health-endpoint-spec.md` documenting proactive-deps format
- [ ] Custom schema mapping guide with examples
- [ ] Example mappings for Spring Boot Actuator, ASP.NET health checks
- [ ] Step-by-step guide for creating a custom mapping

---

### 7.3c — Admin guide
**Linear:** [PRO-113](https://linear.app/team/PRO-113)
**Blocked by:** PRO-83
**Scope:** First-run setup walkthrough, user/team management, admin settings, alert channel setup, data retention, SSRF allowlist, troubleshooting.

**Acceptance criteria:**
- [ ] `docs/admin-guide.md` covering all admin operations
- [ ] First-run setup walkthrough (both OIDC and local auth)
- [ ] User/team management guide
- [ ] Alert configuration guide (Slack, webhook)
- [ ] Troubleshooting section (common issues + fixes)

---

### 7.3d — API reference and README overhaul
**Linear:** [PRO-114](https://linear.app/team/PRO-114)
**Blocked by:** PRO-81
**Scope:** All endpoints with request/response schemas, curl examples, README overhaul with quickstart, feature list, screenshots, badges.

**Acceptance criteria:**
- [ ] `docs/api-reference.md` with all endpoints, request/response schemas, curl examples
- [ ] `README.md` overhauled: quickstart, feature list, screenshots, badges
- [ ] `CLAUDE.md` updated to reflect all 1.0 changes

---

## Dependency Graph

```
Phase 1 (all parallel except 1.7b):
  PRO-93 ──→ PRO-94

Phase 1 → Phase 2:
  PRO-91, PRO-92 ──→ PRO-97

Phase 2 chains:
  PRO-97 ──→ PRO-98

Phase 2 → Phase 3:
  PRO-75 ──→ PRO-76
  PRO-97 ──→ PRO-99
  PRO-98 ──→ PRO-55, PRO-102

Phase 3 chains:
  PRO-99 ──→ PRO-100, PRO-101
  PRO-102 ──→ PRO-103

Phase 2 → Phase 4:
  PRO-97 ──→ PRO-78, PRO-104
  PRO-78 ──→ PRO-79
  PRO-104 ──→ PRO-105

Phase 5 chains:
  PRO-81 ──→ PRO-82
  PRO-82 ──→ PRO-83, PRO-84
  PRO-97 ──→ PRO-106
  PRO-106 ──→ PRO-107, PRO-108

Phase 6 chains:
  PRO-86 ──→ PRO-87 ──→ PRO-88

Phase 7 dependencies:
  PRO-81 ──→ PRO-109, PRO-114
  PRO-55 ──→ PRO-111
  PRO-105 ──→ PRO-112
  PRO-83 ──→ PRO-113
  PRO-109 ──→ PRO-110 (LAST)
```

## Parallelization Opportunities

These groups can be worked simultaneously:

**Group A (Phase 1):** PRO-67, PRO-91, PRO-92, PRO-68, PRO-69, PRO-70, PRO-95, PRO-96, PRO-93 — all independent

**Group B (Phase 2, after IDOR fixes):** PRO-97 + PRO-74 + PRO-75 — independent of each other (PRO-97 needs PRO-91/92; the other two have no blockers)

**Group C (after PRO-97):** PRO-98, PRO-99, PRO-78, PRO-104, PRO-106 — all blocked only by PRO-97

**Group D (Phase 5 + 6 in parallel):** PRO-81 -> PRO-82 chain is independent of PRO-86 -> PRO-87 -> PRO-88 chain

**Group E (Docs, once blockers clear):** PRO-109, PRO-111, PRO-112, PRO-113, PRO-114 — mostly independent of each other

## Story Count by Phase

| Phase | Stories | Description |
|-------|---------|-------------|
| 1 | 10 | Security Hardening |
| 2 | 4 | Access Control & Core Infrastructure |
| 3 | 7 | Admin Settings UI & Local Auth |
| 4 | 4 | Custom Schema Support |
| 5 | 7 | Alerting |
| 6 | 3 | Metrics History Charts |
| 7 | 7 | Deployment, Docs & Release |
| **Total** | **42** | (PRO-55 counted once, appears in Phase 3 & 7) |
