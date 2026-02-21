# Depsera 1.0 — Product Requirements Document

## Vision

Depsera is a self-hosted, open-source dependency monitoring and service health dashboard. Organizations deploy it internally to get org-wide visibility into microservice health, dependency relationships, and failure propagation — similar to how Jenkins or Portainer are deployed as standalone infrastructure tools.

**1.0 Goal:** A secure, deployable, well-documented release that an engineering team can self-serve install (Docker or bare Node), connect their services, and immediately gain org-wide dependency visibility.

## Target Users

- **Platform / SRE teams** deploying and managing the Depsera instance
- **Engineering team leads** registering their team's services and configuring health endpoints
- **Engineers** viewing the dependency graph, dashboards, and service health across the org

## What Already Exists

The following features are complete and functional today:

- **Authentication**: OIDC with PKCE, local auth for development, first-user admin bootstrap
- **RBAC**: Admin, team lead, and member roles with middleware enforcement
- **Team Management**: CRUD, member management, role assignment
- **Service Management**: CRUD, per-service poll intervals, manual polling
- **Health Polling**: Cache-TTL scheduling, exponential backoff, circuit breaker, host rate limiting, poll deduplication
- **Dependency Tracking**: Parses proactive-deps format, latency/error history, dependency aliases
- **Auto-Suggestion Engine**: 5 matching strategies with confidence scoring for dependency-to-service associations
- **Dependency Graph**: Interactive React Flow visualization with filtering, layout persistence, latency indicators
- **Dashboard**: Summary cards, issues list, team health breakdown, recent activity, graph preview
- **Wallboard**: Full-screen service status board with team filtering
- **Associations Page**: Suggestions inbox, manual creation, existing associations, alias management
- **Dark Mode**: Theme toggle with localStorage persistence
- **Security**: CSP, HSTS, SSRF protection, CSRF (double-submit cookie), rate limiting, session secret validation, redirect validation
- **Static Serving**: Express serves built client in production with compression and SPA routing
- **Test Suite**: 130+ tests across client and server, all passing

---

## 1.0 Requirements

### Phase 1: Security Hardening

Complete all open security stories to establish a production-trustworthy baseline. These have no feature dependencies and should be done first.

#### 1.1 — Whitelist ORDER BY columns in store queries
> Existing story: PRO-67

String-interpolated `orderBy`/`orderDirection` in store queries create a SQL injection vector. Add a whitelist of allowed column names per store and reject anything not on the list.

**Scope:** Server stores (ServiceStore, UserStore, DependencyStore, TeamStore, AssociationStore, LatencyHistoryStore, ErrorHistoryStore)

#### 1.2a — Fix IDOR on association routes
> PRO-91 (split from PRO-66)

Association routes only check `requireAuth` but don't verify the user has access to the specific dependency's owning service/team.

**Scope:** Add team ownership verification before creating/deleting associations. Return 403 for unauthorized access.

#### 1.2b — Fix IDOR on alias routes — restrict to admin
> PRO-92 (split from PRO-66)

Alias routes allow any authenticated user to CRUD dependency aliases, which affect all services globally.

**Scope:** Add `requireAdmin` middleware to alias create/update/delete. Keep read endpoints accessible to all authenticated users.

#### 1.3 — Sanitize error messages returned to clients
> Existing story: PRO-68

Route handlers return raw `error.message` in 500 responses. Poll error messages containing internal URLs/IPs are stored and served via API.

**Scope:** Create a sanitized error response utility. Replace all raw `error.message` usage in route handlers. Sanitize stored poll error messages.

#### 1.4 — ~~Harden auth bypass configuration~~ **[Removed]**
> Existing story: PRO-69

> **Removed.** Auth bypass mode was fully removed from the codebase. `LOCAL_AUTH=true` replaces it for local development.

#### 1.5 — Improve session cookie security
> Existing story: PRO-70

Session cookie uses `sameSite: 'lax'` instead of `'strict'`. `secure` flag depends solely on `NODE_ENV`.

**Scope:** Evaluate `sameSite: 'strict'` against OIDC callback flow. Add startup warning if `secure` is false outside dev. Explicit cookie path scoping.

#### 1.6a — Minor server-side hardening
> PRO-95 (split from PRO-72)

Timing-safe OIDC state comparison, explicit body size limits on `express.json()`, session destroy error handling, SQLite WAL pragmas, `eslint-plugin-security` for server.

**Scope:** Small targeted server-side fixes across auth and middleware.

#### 1.6b — Minor client-side hardening
> PRO-96 (split from PRO-72)

Use `URLSearchParams` for query parameter encoding, validate localStorage JSON parsing, add `eslint-plugin-security` for client.

**Scope:** Small targeted client-side security fixes.

#### 1.7a — HTTP request logging middleware
> PRO-93 (split from PRO-71)

No HTTP request logging exists. Security incidents cannot be detected.

**Scope:** Install and configure `pino` + `pino-http`. Log method, path, status code, response time, user ID. Structured JSON in production, readable format in development. Configurable via `LOG_LEVEL` env var.

#### 1.7b — Admin action audit trail
> PRO-94 (split from PRO-71, blocked by PRO-93)

No audit trail for state-changing admin actions.

**Scope:** Create `audit_log` table and AuditLogStore. Log admin actions (role changes, user deactivation, team/service CRUD). `GET /api/admin/audit-log` endpoint (admin only). Subject to data retention cleanup.

---

### Phase 2: Access Control & Core Infrastructure

Build the foundational systems that later features depend on.

#### 2.1a — Server team-scoped service API filtering and authorization
> PRO-97 (split from PRO-73, blocked by PRO-91, PRO-92)

Server-side changes to scope service management by team membership.

**Requirements:**
- `GET /api/services` returns only the requesting user's team services (unless admin)
- Service create/edit/delete restricted to team members (team lead+) of the owning team
- Graph, wallboard, and dashboard endpoints continue to return ALL services org-wide for all authenticated users
- Admin users bypass all team restrictions

**Scope:** Modify service routes, add team membership check middleware or extend `requireTeamAccess`.

#### 2.1b — Update client service list for team-scoped results
> PRO-98 (split from PRO-73, blocked by PRO-97)

Client-side changes to reflect the team-scoped service list API.

**Scope:** Adjust team filter dropdown behavior, update empty states, verify graph/wallboard/dashboard unaffected.

#### 2.2 — Data retention system
> PRO-74

Latency and error history tables grow unbounded. Add configurable retention with scheduled cleanup.

**Requirements:**
- Default retention period: 365 days
- Configurable via `DATA_RETENTION_DAYS` env var (initial support)
- Configurable via admin settings UI (added in Phase 3)
- Scheduled cleanup job runs at a configurable time (default: 02:00 local time daily)
- Cleanup deletes rows from `dependency_latency_history` and `dependency_error_history` older than retention period
- Cleanup logs number of rows deleted

**Scope:** Background job scheduler, cleanup query, env var configuration. Settings table and UI come in Phase 3.

#### 2.3 — Admin settings backend
> PRO-75

Create a `settings` key-value table and API to persist application-wide configuration. This replaces env-var-only configuration for runtime-tunable settings.

**Requirements:**
- New `settings` table: `key (TEXT PK)`, `value (TEXT)`, `updated_at`, `updated_by`
- Settings API: `GET /api/settings` (admin only), `PUT /api/settings` (admin only)
- Settings keys for 1.0:
  - `data_retention_days` (default: 365)
  - `retention_cleanup_time` (default: "02:00")
  - `default_poll_interval_ms` (default: 30000)
  - `ssrf_allowlist` (default: from env var)
  - `global_rate_limit` (default: 100)
  - `global_rate_limit_window_minutes` (default: 15)
  - `auth_rate_limit` (default: 10)
  - `auth_rate_limit_window_minutes` (default: 1)
- Env vars serve as initial defaults; admin settings override them at runtime
- Settings cached in memory, refreshed on update

**Scope:** Migration, store, routes, caching layer. UI comes in 3.1.

---

### Phase 3: Admin Settings UI & Local Auth

#### 3.1 — Admin settings page
> PRO-76

Admin-only UI for managing application-wide settings.

**Requirements:**
- New route: `/admin/settings`
- Sections:
  - **Data Retention**: Retention period (days), cleanup schedule time
  - **Polling Defaults**: Default poll interval for new services
  - **Security**: SSRF allowlist (textarea, one entry per line), rate limit configuration
  - **Alerts**: Alert rate limiting / flap protection settings (added in Phase 5)
- Form validation with save confirmation
- Settings take effect immediately (no restart required)
- Admin-only nav link (alongside existing Users admin link)

**Scope:** New page component, API integration, form with sections.

#### 3.2a — Local auth backend — migration, routes, and bcrypt
> PRO-99 (split from PRO-53, blocked by PRO-97)

Server-side local auth mode for zero-external-dependency deployment.

**Requirements:**
- `LOCAL_AUTH=true` env var enables local auth mode
- Migration: add nullable `password_hash` column to `users` table
- On first startup: create initial admin from `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars
- `POST /api/auth/login` for credentials-based login
- `GET /api/auth/mode` — new endpoint returning current auth mode
- Passwords stored with bcrypt (minimum 12 rounds)

**Scope:** Migration, auth routes, mode detection endpoint.

#### 3.2b — Local auth login page
> PRO-100 (split from PRO-53, blocked by PRO-99)

Client-side login page conditional rendering for local auth mode.

**Scope:** Call `/api/auth/mode` to determine mode, show username/password form or OIDC redirect button accordingly.

#### 3.2c — Admin local user management
> PRO-101 (split from PRO-53, blocked by PRO-99)

Admin ability to create and manage local user accounts.

**Scope:** Create user API endpoint, password reset endpoint, UI on admin user management page (only visible in local auth mode).

**Out of scope for 1.0:** Password reset flow for self-service, mixing OIDC + local auth simultaneously.

#### 3.3a — Automated OIDC integration tests
> PRO-102 (split from PRO-77, blocked by PRO-98)

Automated tests using `oidc-provider` (Node.js) as a lightweight in-process OIDC server.

**Scope:** Test login redirect, callback token exchange, user creation/sync, session establishment, logout, first-user admin bootstrap, error handling.

#### 3.3b — OIDC manual testing infrastructure
> PRO-103 (split from PRO-77, blocked by PRO-102)

Docker Compose profile with Keycloak for manual end-to-end testing, plus Okta testing guide.

**Scope:** Keycloak compose file with pre-configured realm, `docs/testing-with-okta.md` guide.

---

### Phase 4: Custom Health Endpoint Schema Support

Enable Depsera to ingest dependency health data from services that don't use the proactive-deps format.

#### 4.1 — Schema mapping data model

**Requirements:**
- New `schema_mappings` table or a `schema_config` JSON column on the `services` table
- Schema mapping structure:
  ```json
  {
    "root": "data.healthChecks",
    "fields": {
      "name": "checkName",
      "healthy": { "field": "status", "equals": "ok" },
      "latency": "responseTimeMs",
      "impact": "severity",
      "description": "displayName"
    }
  }
  ```
- `root`: JSON path (dot notation) to the array of dependency check objects in the response
- `fields`: Maps each Depsera-required field to the source field. Supports:
  - Direct mapping: `"name": "checkName"` (source field name)
  - Boolean comparison: `"healthy": { "field": "status", "equals": "ok" }` (field + value match)
  - Nested paths: `"latency": "metrics.responseTime"` (dot notation)
- Services without a schema mapping default to proactive-deps format
- Migration to add schema config storage

**Scope:** Data model, migration, TypeScript types.

#### 4.2 — Schema-aware dependency parser

**Requirements:**
- Refactor `DependencyParser` to accept an optional schema mapping
- When a schema mapping exists for the service, use it to extract dependency data from the health endpoint response
- When no mapping exists, use the existing proactive-deps parser (backwards compatible)
- Validate parsed data has required fields (name, healthy at minimum)
- Graceful handling of malformed responses (log warning, skip dependency)

**Scope:** Parser refactor, schema resolution logic, validation.

#### 4.3a — Schema mapping test endpoint
> PRO-104 (split from PRO-80, blocked by PRO-97)

Backend endpoint to test a schema mapping against a live health endpoint URL.

**Requirements:**
- `POST /api/services/test-schema` endpoint (authenticated, team lead+)
- Fetches URL, applies schema mapping, returns parsed results + warnings
- SSRF protection on URL validation
- Does NOT store anything — purely a preview/test operation

**Scope:** Test endpoint, SSRF validation, response formatting.

#### 4.3b — Schema mapping form on service create/edit
> PRO-105 (split from PRO-80, blocked by PRO-104)

Client-side form for configuring custom schema mappings.

**Requirements:**
- "Health Endpoint Format" section on service create/edit form
- Toggle between "proactive-deps (default)" and "Custom schema"
- Guided form for field mappings when custom schema selected
- "Test mapping" button calls test-schema endpoint and shows preview
- Advanced toggle to edit raw JSON mapping for power users
- Validation: name and healthy fields required when custom schema selected

**Scope:** Service form extension, preview integration, validation.

---

### Phase 5: Alerting

Add team-level alert notifications via Slack and webhooks when service health changes.

#### 5.1 — Alert configuration data model
> PRO-81

**Requirements:**
- New `alert_channels` table:
  - `id`, `team_id (FK)`, `channel_type` (slack | webhook), `config` (JSON), `is_active`, `created_at`, `updated_at`
  - `config` for Slack: `{ "webhook_url": "https://hooks.slack.com/..." }`
  - `config` for webhook: `{ "url": "https://...", "headers": { ... }, "method": "POST" }`
- New `alert_rules` table:
  - `id`, `team_id (FK)`, `severity_filter` (critical | warning | all), `is_active`, `created_at`, `updated_at`
- New `alert_history` table:
  - `id`, `alert_channel_id (FK)`, `service_id (FK)`, `dependency_id (FK)`, `event_type`, `payload` (JSON), `sent_at`, `status` (sent | failed | suppressed)
- Alert history subject to data retention cleanup

**Scope:** Migration, types, store interfaces + implementations.

#### 5.2 — Alert dispatch engine
> PRO-82

**Requirements:**
- Listen to existing polling events (`STATUS_CHANGE`, `POLL_ERROR`)
- When a dependency status changes, evaluate alert rules for the owning team
- Severity matching: only fire alerts matching the configured severity filter
- **Flap protection**: Suppress repeated alerts for the same dependency within a configurable cooldown window (default: 5 minutes, configurable in admin settings as `alert_cooldown_minutes`)
- **Rate limiting**: Maximum N alerts per team per hour (default: 30, configurable in admin settings as `alert_rate_limit_per_hour`)
- Dispatch to configured channels (Slack, webhook)
- Record all alert attempts in `alert_history` (including suppressed ones)
- Retry failed dispatches once after 30 seconds

**Scope:** Alert service, Slack sender, webhook sender, flap detection, rate limiting.

#### 5.3 — Slack integration
> PRO-83

**Requirements:**
- Send formatted Slack messages via incoming webhook URL
- Message format: service name, dependency name, old status -> new status, timestamp, link back to Depsera service detail page
- Use Slack Block Kit for rich formatting
- Configurable Depsera base URL (env var `APP_BASE_URL`) for deep links

**Scope:** Slack message formatter, HTTP sender.

#### 5.4 — Webhook integration
> PRO-84

**Requirements:**
- POST JSON payload to configured webhook URL
- Payload: `{ event, service, dependency, oldStatus, newStatus, timestamp, severity }`
- Configurable custom headers (for auth tokens, API keys)
- Timeout: 10 seconds
- Record response status in alert history

**Scope:** Webhook dispatcher, payload formatter.

#### 5.5a — Alert channel, rules, and history API routes
> PRO-106 (split from PRO-85, blocked by PRO-97)

Server-side API routes for managing alert channels, rules, and viewing alert history per team.

**Scope:** CRUD endpoints for channels, rules, and history. Team membership verification. Input validation.

#### 5.5b — Alert channel management UI
> PRO-107 (split from PRO-85, blocked by PRO-106)

UI for creating, editing, testing, and deleting alert channels on the team detail page.

**Scope:** Channel CRUD form, test channel button, channel list with enable/disable toggle.

#### 5.5c — Alert rules configuration and history view
> PRO-108 (split from PRO-85, blocked by PRO-106)

UI for configuring alert severity rules and viewing alert history per team.

**Scope:** Severity filter dropdown, enable/disable toggle, alert history table with status filtering.

---

### Phase 6: Metrics History Charts

Visualize dependency health and latency trends using existing SQLite data. No external dependencies (Prometheus removed from scope).

#### 6.1 — Latency history and health timeline API enhancements
> PRO-86

**Requirements:**
- `GET /api/latency/:dependencyId?range=1h|6h|24h|7d|30d` — return time-bucketed latency data
- Response: array of `{ timestamp, min, avg, max, count }` bucketed by appropriate intervals:
  - 1h/6h: 1-minute buckets
  - 24h: 15-minute buckets
  - 7d: 1-hour buckets
  - 30d: 6-hour buckets
- `GET /api/dependencies/:id/timeline?range=24h|7d|30d` — return health state transitions
- Efficient SQLite aggregation queries

**Scope:** API enhancements, SQLite aggregation queries, timeline endpoint.

#### 6.2 — Chart components
> PRO-87

**Requirements:**
- Latency chart: line chart showing min/avg/max over time with range selector
- Health timeline: horizontal bar/swimlane showing healthy (green) / warning (yellow) / critical (red) periods
- Chart library: Recharts (lightweight, React-native, already in the React ecosystem)
- Time range selector component (1h, 6h, 24h, 7d, 30d) reusable across charts

**Scope:** Install Recharts, create chart components, time range selector.

#### 6.3 — Integrate charts into views
> PRO-88

**Requirements:**
- **Service detail page**: Latency chart + health timeline per dependency
- **Dashboard**: Aggregate health chart (% healthy over time across all services)
- Charts auto-refresh with the page's existing polling interval
- Empty state when no historical data exists

**Scope:** Integration into existing pages, data fetching hooks.

---

### Phase 7: Deployment, Documentation & Release

#### 7.1 — Dockerfile and Docker Compose
> Existing story: PRO-55

**Requirements:**
- Multi-stage Dockerfile: build stage (client + server) → minimal Node.js runtime
- Final image: production deps + built artifacts only
- `NODE_ENV=production` baked in
- Internal port 3001, consumers map via `-p`
- SQLite data directory as mountable volume (`/data`)
- Docker health check using `/api/health`
- `docker-compose.yml` example with sensible defaults
- If no OIDC config provided, defaults to local auth mode
- Image name: `depsera`

**Scope:** Dockerfile, .dockerignore, docker-compose.yml, README Docker section.

#### 7.2a — Legal and community files
> PRO-109 (split from PRO-89, blocked by PRO-81)

**Requirements:**
- Apache 2.0 license file
- Contributor License Agreement (CLA)
- `CONTRIBUTING.md` — development setup, code style, PR process, CLA requirement
- `CODE_OF_CONDUCT.md` — Contributor Covenant
- `.github/ISSUE_TEMPLATE/` — bug report and feature request templates
- `.github/PULL_REQUEST_TEMPLATE.md`

**Scope:** Legal files, GitHub config.

#### 7.2b — Squash git history and create release tag
> PRO-110 (split from PRO-89, blocked by PRO-109)

**Requirements:**
- Squash/clean git history for public release
- Verify no secrets, credentials, or sensitive data in history
- Create `v1.0.0` release tag with release notes

**Scope:** Git history rewrite, release tagging. **Must be the very last task.**

#### 7.3a — Installation guide and configuration reference
> PRO-111 (split from PRO-90, blocked by PRO-55)

**Scope:** Docker quickstart, Docker Compose setup, bare Node.js deployment guide, reverse proxy examples (nginx, Caddy), complete env var reference, backup procedures.

#### 7.3b — Health endpoint spec and custom schema guide
> PRO-112 (split from PRO-90, blocked by PRO-105)

**Scope:** Default proactive-deps format documentation, custom schema mapping guide with examples for common formats (Spring Boot Actuator, ASP.NET health checks).

#### 7.3c — Admin guide
> PRO-113 (split from PRO-90, blocked by PRO-83)

**Scope:** First-run setup walkthrough, user/team management, admin settings, alert channel setup, data retention, SSRF allowlist, troubleshooting.

#### 7.3d — API reference and README overhaul
> PRO-114 (split from PRO-90, blocked by PRO-81)

**Scope:** All endpoints with request/response schemas, example curl commands, README overhaul with quickstart, feature list, screenshots, badges, CLAUDE.md updates.

---

## Deferred to Post-1.0

| Feature | Rationale |
|---|---|
| WebSocket real-time updates (PRO-26) | Polling works well enough; WebSocket is a UX enhancement |
| Prometheus integration (PRO-13) | Adds external dependency; SQLite-based charts are sufficient |
| Per-user notification preferences | Team-level alerting is sufficient for 1.0 |
| PostgreSQL / HA support | Single-instance SQLite is appropriate for the target deployment model |
| CI/CD pipeline (GitHub Actions) | Can be added post-release without affecting functionality |
| Password reset flow (local auth) | Admin can create/reset users manually for 1.0 |
| Mixed OIDC + local auth | Pick one mode per deployment for 1.0 |

---

## Implementation Order

Stories should be worked in the order listed below. Each phase builds on the previous. Stories marked with `→` indicate a sequential dependency within the split.

```
Phase 1: Security Hardening (10 stories)
  1.1   PRO-67   Whitelist ORDER BY columns
  1.2a  PRO-91   Fix IDOR on association routes
  1.2b  PRO-92   Fix IDOR on alias routes — restrict to admin
  1.3   PRO-68   Sanitize error messages
  1.4   PRO-69   ~~Harden auth bypass config~~ [Removed]
  1.5   PRO-70   Session cookie security
  1.6a  PRO-95   Minor server-side hardening
  1.6b  PRO-96   Minor client-side hardening
  1.7a  PRO-93   HTTP request logging
  1.7b  PRO-94   → Admin action audit trail

Phase 2: Access Control & Core Infrastructure (4 stories)
  2.1a  PRO-97   Server team-scoped service API
  2.1b  PRO-98   → Client service list update
  2.2   PRO-74   Data retention system
  2.3   PRO-75   Admin settings backend

Phase 3: Admin Settings UI & Local Auth (7 stories)
  3.1   PRO-76   Admin settings page (UI)
  3.2a  PRO-99   Local auth backend (migration, routes, bcrypt)
  3.2b  PRO-100  → Login page UI
  3.2c  PRO-101  → Admin local user management
  3.3a  PRO-102  Automated OIDC integration tests
  3.3b  PRO-103  → Manual OIDC testing infrastructure
  3.4   PRO-55   Dockerfile + Docker Compose

Phase 4: Custom Schema Support (4 stories)
  4.1   PRO-78   Schema mapping data model
  4.2   PRO-79   Schema-aware dependency parser
  4.3a  PRO-104  Schema mapping test endpoint
  4.3b  PRO-105  → Schema mapping form UI

Phase 5: Alerting (7 stories)
  5.1   PRO-81   Alert configuration data model
  5.2   PRO-82   Alert dispatch engine
  5.3   PRO-83   Slack integration
  5.4   PRO-84   Webhook integration
  5.5a  PRO-106  Alert API routes (channels, rules, history)
  5.5b  PRO-107  → Alert channel management UI
  5.5c  PRO-108  → Alert rules & history UI

Phase 6: Metrics History Charts (3 stories)
  6.1   PRO-86   Latency history + health timeline APIs
  6.2   PRO-87   Chart components (Recharts)
  6.3   PRO-88   Integrate charts into views

Phase 7: Deployment, Documentation & Release (7 stories)
  7.1   PRO-55   Dockerfile + Docker Compose
  7.2a  PRO-109  Legal and community files
  7.2b  PRO-110  → Squash git history + release tag (LAST)
  7.3a  PRO-111  Installation guide + config reference
  7.3b  PRO-112  Health endpoint spec + custom schema guide
  7.3c  PRO-113  Admin guide
  7.3d  PRO-114  API reference + README overhaul

Total: 41 stories (+ 1 shared: PRO-55 in Phase 3 & 7)
```

### Key Blocking Relationships

```
PRO-91, PRO-92 (IDOR fixes) ──→ PRO-97 (team scoping server)
PRO-97 ──→ PRO-98 (team scoping client)
PRO-97 ──→ PRO-99 (local auth), PRO-104 (schema test), PRO-106 (alert routes)
PRO-97 ──→ PRO-78 (schema data model), PRO-84 (webhook alerts)
PRO-98 ──→ PRO-55 (Docker), PRO-102 (OIDC tests)
PRO-93 ──→ PRO-94 (audit trail)
PRO-99 ──→ PRO-100 (login UI), PRO-101 (user mgmt)
PRO-104 ──→ PRO-105 (schema form)
PRO-106 ──→ PRO-107 (channel UI), PRO-108 (rules/history UI)
PRO-101, PRO-105, PRO-108 ──→ PRO-82 (alert dispatch engine)
PRO-81 ──→ PRO-109 (legal files), PRO-114 (API docs)
PRO-109 ──→ PRO-110 (git squash — VERY LAST)
PRO-55 ──→ PRO-111 (install guide)
PRO-105 ──→ PRO-112 (schema docs)
PRO-83 ──→ PRO-113 (admin guide)
```

### Working Guidance

- Stories within a phase can generally be worked in parallel except where `→` indicates a sequential dependency
- Each story is intentionally small-scope (1-3 day estimate per story for a single developer)
- Phase 1 stories have no cross-dependencies and can all be worked simultaneously
- PRO-110 (git squash + release tag) must be the absolute last task before public release

---

## Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Database | SQLite (single instance) | Zero external dependencies, sufficient for target scale, store pattern enables future migration |
| Chart library | Recharts | Lightweight, React-native, no external service dependency |
| Alert delivery | Slack webhooks + generic HTTP webhooks | Covers 90% of use cases without complex integrations |
| Schema mapping | JSON config per service | Simple, no plugin system needed, UI-configurable |
| License | Apache 2.0 + CLA | Permissive for adoption, CLA preserves relicensing flexibility |
| Auth modes | OIDC (default) or local auth (standalone) | Mutually exclusive per deployment, covers enterprise and standalone |
| Session store | SQLite (existing) | Already implemented, no additional dependencies |
| Real-time updates | Client-side polling | Sufficient for 1.0, WebSocket deferred |
