# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Depsera - A dependency monitoring and service health dashboard.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + CSS Modules (`/client`)
- **Backend:** Express.js + TypeScript + SQLite (`/server`)
- **Testing:** Jest + React Testing Library
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
```

## Database Commands

```bash
# Run from /server directory
npm run db:migrate    # Run pending migrations
npm run db:rollback   # Rollback last migration
npm run db:status     # Show migration status
npm run db:seed       # Seed with development data
npm run db:clear      # Clear all data (dangerous!)
```

## Architecture

- `/client` - React SPA with Vite, routes via react-router-dom
- `/server` - Express REST API, SQLite database in `/server/data/` (sessions also stored in SQLite via `better-sqlite3-session-store`)
- `/server/src/middleware/` - Express middleware (security headers, HTTPS redirect, trust proxy, CSRF, rate limiting, request logging, static file serving, compression)
- API proxy configured in Vite dev server (client requests to `/api/*` forward to backend)
- In production, Express serves the built client from `client/dist/` with compression and SPA catch-all routing (auto-detected)

## Database Schema

Core tables:
- `users` - User accounts (OIDC authenticated)
- `teams` - Organizational units that own services
- `team_members` - Junction table for user-team membership
- `services` - Tracked APIs/microservices with health endpoints (has `poll_interval_ms` for per-service poll scheduling)
- `dependencies` - Dependency status data from proactive-deps (has `canonical_name` column for alias resolution)
- `dependency_associations` - Links between dependencies and services
- `dependency_aliases` - Maps reported dependency names (alias) to canonical names
- `dependency_latency_history` - Historical latency data points per dependency
- `dependency_error_history` - Historical error records per dependency
- `audit_log` - Admin action audit trail (user/team/service mutations) with user FK, IP address, and JSON details
- `settings` - Key-value store for runtime-configurable admin settings (key TEXT PK, value TEXT, updated_at, updated_by FK → users)

Migrations are in `/server/src/db/migrations/` (001-009). Types are in `/server/src/db/types.ts`.

## Client-Side Storage

- `graph-node-positions-{userId}` — Persisted node positions for manually dragged graph nodes (per user)
- `graph-layout-direction` — Graph layout direction (TB/LR)
- `graph-tier-spacing` — Graph tier spacing value
- `graph-latency-threshold` — High latency threshold percentage

## Store Registry

All data access goes through `StoreRegistry` (`/server/src/stores/index.ts`). Stores:
- `services`, `teams`, `users`, `dependencies`, `associations`, `latencyHistory`, `errorHistory`, `aliases`, `auditLog`, `settings`

Interfaces in `/server/src/stores/interfaces/`, implementations in `/server/src/stores/impl/`.

**ORDER BY validation:** All stores that accept `orderBy`/`orderDirection` parameters use `validateOrderBy()` from `/server/src/stores/orderByValidator.ts` to whitelist allowed columns and prevent SQL injection. Each store defines its own `ALLOWED_COLUMNS` set. Invalid columns throw `InvalidOrderByError`.

## Settings Service

`SettingsService` (`/server/src/services/settings/SettingsService.ts`) provides in-memory cached access to admin-configurable settings. Singleton pattern with auto-loading from DB on first access. Settings keys: `data_retention_days`, `retention_cleanup_time`, `default_poll_interval_ms`, `ssrf_allowlist`, `global_rate_limit`, `global_rate_limit_window_minutes`, `auth_rate_limit`, `auth_rate_limit_window_minutes`, `alert_cooldown_minutes`, `alert_rate_limit_per_hour`. Env vars serve as initial defaults; DB values override at runtime.

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
- **Session Security:** Session cookie uses `secure: 'auto'` to derive the `Secure` flag from `req.secure` (works with `trust proxy`). In production (`NODE_ENV=production`), the server refuses to start if `SESSION_SECRET` is missing, matches a known weak default, or is shorter than 32 characters. See `/server/src/auth/session.ts` and `/server/src/auth/validateSessionSecret.ts`.
- **Redirect Validation:** Logout redirect URLs are validated to prevent open redirect attacks. Only relative paths, same-origin URLs, and external HTTPS URLs (for OIDC end-session endpoints) are allowed. See `/client/src/utils/redirect.ts`.
- **Rate Limiting:** In-memory rate limiting via `express-rate-limit`. Global limit (100 req/15min per IP) applied before session middleware to reject abusive requests early. Stricter auth limit (10 req/1min per IP) on `/api/auth` to prevent brute-force attacks. All limits configurable via env vars. See `/server/src/middleware/rateLimit.ts`.
- **Error Sanitization:** All route handler catch blocks use `sendErrorResponse()` which logs the full error server-side and returns sanitized responses to clients. Non-operational errors (non-`AppError`) return generic `{ error: "Internal server error" }` with no `message` field. `InvalidOrderByError` is treated as client input validation (returns 400). Poll errors are sanitized via `sanitizePollError()` before DB storage — strips private IPs, internal URLs, file paths, and maps known error codes (ECONNREFUSED, ETIMEDOUT, etc.) to safe descriptions. See `/server/src/utils/errors.ts`.
- **HTTP Request Logging:** Structured logging via `pino` + `pino-http`. Logs method, path, status code, response time, and authenticated user ID. Sensitive headers (`Authorization`, `Cookie`, `X-CSRF-Token`, `Set-Cookie`) are redacted. `/api/health` excluded from logs by default. JSON output in production, pretty-printed in development. Configurable via `LOG_LEVEL` env var (default: `info`). See `/server/src/utils/logger.ts` and `/server/src/middleware/requestLogger.ts`.
- **Audit Trail:** Admin action audit log records all user, team, and service mutations with actor, action, resource, details, and IP address. Fire-and-forget logging — errors are logged but never block the request. Admin-only query endpoint with filtering by date range, user, action, and resource type. See `/server/src/services/audit/AuditLogService.ts`.

Key files in `/server/src/services/polling/`:
- `HealthPollingService.ts` — Main orchestrator (singleton)
- `CircuitBreaker.ts` — Per-service circuit breaker (closed/open/half-open)
- `PollCache.ts` — In-memory TTL cache for poll scheduling
- `backoff.ts` — Exponential backoff utility
- `PollStateManager.ts` — In-memory state tracking per service
- `ServicePoller.ts` — Executes individual service polls
- `HostRateLimiter.ts` — Per-hostname concurrency semaphore for poll DDoS protection
- `PollDeduplicator.ts` — Promise coalescing for concurrent polls to the same URL

## API Routes

- `/api/auth` - OIDC authentication
- `/api/services` - CRUD + manual polling (team-scoped: non-admin users see only their team's services; mutations require team lead+; poll requires team membership)
- `/api/teams` - CRUD + member management
- `/api/users` - Admin user management
- `/api/aliases` - Dependency alias CRUD (admin only for mutations) + canonical name lookup
- `/api/dependencies/:id/associations` - Association CRUD (team membership required for mutations)
- `/api/associations/suggestions` - Auto-suggestion management (team membership required for accept/dismiss)
- `/api/graph` - Dependency graph data
- `/api/latency/:id` - Latency history
- `/api/errors/:id` - Error history
- `/api/admin/audit-log` - Audit log query (admin only, filterable by date range, user, action, resource type)
- `/api/admin/settings` - Admin settings CRUD (admin only, GET returns all settings with defaults, PUT updates settings)

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
