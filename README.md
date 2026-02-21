# Depsera

A dependency monitoring and service health dashboard. Monitor service health, visualize dependency relationships, and track issues across teams.

> **Note:** This project is in early stages of development and is not ready for production deployment.

## Features

- **Dashboard Overview** — Summary of service health across all teams with quick links to issues and recent activity
- **Service Management** — Register services with health endpoints, view dependency status, trigger manual polls, and track error/latency history
- **Dependency Graph** — Interactive visualization (React Flow) of service dependencies with team filtering, search/highlight, layout controls, and latency threshold filtering
- **Wallboard** — Real-time status board with service health cards, team filtering, and unhealthy-only view
- **Team Management** — Organize services by team, manage members and roles (lead/member)
- **User Administration** — Admin panel for managing users, roles, and account status
- **Auto-Polling** — Server-side health polling with per-service configurable intervals (default 30s), exponential backoff on failures, and circuit breaker protection (opens after 10 consecutive failures, 5-minute cooldown); client-side auto-refresh with configurable intervals (10s, 20s, 30s, 1m)
- **Dependency Associations** — Automatic suggestion engine that links dependencies to services using name matching, hostname matching, token overlap, and string similarity with confidence scoring
- **Dependency Aliases** — Map multiple reported dependency names to a single canonical identity, unifying dependencies that different services report under different names
- **Error & Latency History** — Historical tracking of dependency errors and latency with trend analysis
- **Authentication** — OpenID Connect integration or local username/password auth (`LOCAL_AUTH=true`) for zero-external-dependency deployment; optional dev bypass mode; sessions persisted in SQLite (survive server restarts)
- **Role-Based Access Control** — Admin, team lead, and member roles with scoped permissions. Service list and detail views are team-scoped for non-admin users; admin users see all services org-wide
- **Security Hardening** — Security headers (CSP, HSTS, X-Frame-Options) via Helmet, SSRF protection on health endpoints with configurable allowlist for internal networks, CSRF double-submit cookie protection, API rate limiting, session secret enforcement, redirect URL validation, optional HTTPS redirect, and reverse-proxy-aware secure cookies
- **Structured Logging** — HTTP request logging via pino with method, path, status, response time, and user ID; JSON output in production, pretty-printed in development; sensitive headers redacted; configurable log level via `LOG_LEVEL`
- **Audit Trail** — All admin actions (user role changes, team/service mutations, member management) are recorded with actor, action, resource, details, and IP address; queryable via admin API with filtering by date range, user, action, and resource type
- **Admin Settings** — Runtime-configurable application settings with admin UI page and API; 10 keys (data retention, poll intervals, rate limits, alert thresholds) with in-memory cache over SQLite persistence; env-var defaults overridable at runtime; all changes audited
- **Alert Dispatch Engine** — Event-driven alert dispatch that listens to polling status changes and errors; team-scoped alert rules with severity filtering (critical, warning, all); flap protection with configurable cooldown; per-team hourly rate limiting; pluggable sender interface for Slack and webhook channels; automatic retry on failure; all attempts recorded in alert history
- **Slack Alerts** — Rich Block Kit-formatted notifications to Slack via incoming webhooks; shows service name, dependency, status transition, severity, timestamp, and deep link back to Depsera; handles rate limiting (429) and timeouts; configurable via `APP_BASE_URL` env var for deep links

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, CSS Modules, React Flow
- **Backend:** Express.js, TypeScript, SQLite (better-sqlite3)
- **Authentication:** OpenID Connect (openid-client) or local auth (bcryptjs), express-session
- **Mock Services:** Node.js, TypeScript, proactive-deps
- **Testing:** Jest, React Testing Library

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Install all dependencies (root, server, client, and mock-services)
npm run install:all
```

### Environment Configuration

Copy the example env file and configure:

```bash
cp server/.env.example server/.env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `DATABASE_PATH` | `./data/database.sqlite` | SQLite database location |
| `SESSION_SECRET` | — | Session secret (must be 32+ chars in production; weak defaults rejected) |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `OIDC_ISSUER_URL` | — | OIDC provider issuer URL |
| `OIDC_CLIENT_ID` | — | OAuth2 client ID |
| `OIDC_CLIENT_SECRET` | — | OAuth2 client secret |
| `OIDC_REDIRECT_URI` | `http://localhost:3001/api/auth/callback` | OAuth2 callback URL |
| `SSRF_ALLOWLIST` | — | Comma-separated hostnames, wildcards (`*.internal`), and CIDRs (`10.0.0.0/8`) to bypass SSRF blocking for internal services |
| `TRUST_PROXY` | — | Express trust proxy setting for reverse proxy support (`true`, hop count, IP/subnet, `loopback`) |
| `REQUIRE_HTTPS` | `false` | Set `true` to 301-redirect HTTP to HTTPS (requires `TRUST_PROXY` behind a proxy) |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | Global rate limit window |
| `RATE_LIMIT_MAX` | `100` | Max requests per IP per global window |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `60000` (1 min) | Auth endpoint rate limit window |
| `AUTH_RATE_LIMIT_MAX` | `10` | Max auth requests per IP per window |
| `POLL_MAX_CONCURRENT_PER_HOST` | `3` | Max concurrent polls to the same target hostname |
| `LOG_LEVEL` | `info` | Log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |
| `LOCAL_AUTH` | `false` | Set `true` to enable local username/password auth (mutually exclusive with `AUTH_BYPASS`) |
| `ADMIN_EMAIL` | — | Initial admin email (required on first startup with `LOCAL_AUTH=true`) |
| `ADMIN_PASSWORD` | — | Initial admin password, min 8 chars (required on first startup with `LOCAL_AUTH=true`) |
| `APP_BASE_URL` | — | Base URL for deep links in alert messages (e.g., `https://depsera.internal.com`) |
| `AUTH_BYPASS` | `false` | Set `true` to skip OIDC in development |
| `AUTH_BYPASS_USER_EMAIL` | `dev@localhost` | Dev user email (bypass mode) |
| `AUTH_BYPASS_USER_NAME` | `Development User` | Dev user name (bypass mode) |

### Development

```bash
# Run server, client, and mock services in development mode
npm run dev

# Or run them separately:
npm run dev:server  # Starts backend on http://localhost:3001
npm run dev:client  # Starts frontend on http://localhost:3000
npm run dev:mock    # Starts mock services on http://localhost:4000
```

### Database Commands

```bash
# Run from /server directory
npm run db:migrate    # Run pending migrations
npm run db:rollback   # Rollback last migration
npm run db:status     # Show migration status
npm run db:seed       # Seed with development data
npm run db:clear      # Clear all data (dangerous!)
npm run db:reseed     # Full reseed (from root directory)
```

### Testing

```bash
# Run all tests
npm test

# Run tests for a specific package
npm run test:server
npm run test:client
```

### Building

```bash
# Build both packages
npm run build
```

### Production Mode

After building, the server can serve both the API and the client UI from a single process:

```bash
npm run build
cd server
npm start
```

The server auto-detects the built client at `client/dist/` and serves it with compression and appropriate cache headers. No separate web server (nginx, etc.) is required. In development, the Vite dev server continues to be used as before.

### Linting

```bash
# Lint all packages
npm run lint
```

## Project Structure

```
├── client/              # React frontend
│   └── src/
│       ├── components/
│       │   ├── Layout/          # App shell and navigation
│       │   ├── Login/           # Login page
│       │   ├── ProtectedRoute/  # Auth/role guard
│       │   ├── common/          # StatusBadge, Modal, ConfirmDialog, ErrorHistoryPanel, SearchableSelect
│       │   └── pages/
│       │       ├── Dashboard/       # Health summary overview
│       │       ├── Services/        # Service list, detail, and form
│       │       ├── Teams/           # Team list, detail, and form
│       │       ├── DependencyGraph/ # Interactive graph visualization
│       │       ├── Associations/     # Association management
│       │       ├── Wallboard/       # Real-time status board
│       │       └── Admin/           # User management, admin settings
│       ├── contexts/        # Auth and Theme contexts
│       └── hooks/           # usePolling and other custom hooks
├── server/              # Express REST API
│   └── src/
│       ├── auth/            # OIDC, session, bypass middleware
│       ├── db/              # SQLite schema, migrations, types
│       ├── routes/          # API route handlers
│       ├── services/        # Polling, graph building, matching
│       └── stores/          # Data access layer
├── mock-services/       # Mock service topology simulator
│   └── src/
│       ├── topology/        # Service topology generator
│       ├── services/        # Mock service implementations
│       ├── failures/        # Failure injection engine
│       ├── control/         # Control API
│       ├── ui/              # Control panel UI
│       └── seed/            # Dashboard DB seeding
└── package.json         # Root scripts
```

## Pages

### Dashboard (`/`)
Health summary with total/healthy/warning/critical service counts, services with issues, health by team, recent activity feed, and a mini dependency graph preview.

### Services (`/services`)
Searchable, filterable list of all registered services. Click through to service detail for dependency status, latency stats, error history, and manual poll triggering.

### Teams (`/teams`)
Team listing with member/service counts. Team detail shows members with role management and owned services.

### Dependency Graph (`/graph`)
Interactive graph built with React Flow. Controls include team filter, search/highlight, horizontal/vertical layout, tier spacing, latency threshold slider, and minimap. Dragged node positions are persisted per user across page refreshes; use the "Reset Layout" button to revert to auto-layout.

### Associations (`/associations`)
Manage dependency-to-service associations. Four tabs: **Suggestions Inbox** for reviewing auto-generated association suggestions with accept/dismiss (individual and bulk), filterable by source or linked service; **Create** for manually linking a dependency to a target service with searchable dropdowns; **Existing** for browsing confirmed associations by dependency with search, type filter, and delete; **Aliases** for mapping reported dependency names to canonical names so that the same external dependency reported under different names can be unified. Associations are also shown inline on each Service Detail page with a "Generate Suggestions" button.

### Wallboard (`/wallboard`)
Status board showing service health cards with latency stats, impact info, and poll failure indicators. Supports team filtering and unhealthy-only view. Filter preferences persist in localStorage.

### User Management (`/admin/users`)
Admin-only page for managing user accounts: search, filter by status, toggle admin role, deactivate/reactivate users. In local auth mode, admins can also create new users and reset passwords.

### Admin Settings (`/admin/settings`)
Admin-only page for configuring runtime application settings. Organized into collapsible sections: **Data Retention** (retention period, cleanup time), **Polling Defaults** (default poll interval), **Security** (SSRF allowlist, rate limits), and **Alerts** (cooldown, rate limits). Changes take effect immediately with client-side validation and save confirmation.

## API Overview

All endpoints require authentication unless noted. Admin endpoints require the admin role.

| Area | Endpoints |
|------|-----------|
| Auth | `GET /api/auth/login`, `/callback`, `/me`; `POST /api/auth/logout` |
| Users | `GET /api/users`, `GET /api/users/:id`, `POST /api/users` (local auth), `PUT /api/users/:id/role`, `PUT /api/users/:id/password` (local auth), `POST /api/users/:id/reactivate`, `DELETE /api/users/:id` |
| Teams | CRUD on `/api/teams`, member management via `/api/teams/:id/members` |
| Services | CRUD on `/api/services` (team-scoped), `POST /api/services/:id/poll` for manual polling |
| Associations | `/api/dependencies/:id/associations`, suggestion generation and accept/dismiss |
| Aliases | `GET/POST /api/aliases`, `PUT/DELETE /api/aliases/:id`, `GET /api/aliases/canonical-names` |
| Graph | `GET /api/graph` with optional `team`, `service`, `dependency` filters |
| History | `GET /api/latency/:dependencyId`, `GET /api/errors/:dependencyId` |
| Admin | `GET /api/admin/audit-log` (filterable by date, user, action, resource type), `GET/PUT /api/admin/settings` |
| Alerts | `GET/POST /api/teams/:id/alert-channels`, `PUT/DELETE /:channelId`, `POST /:channelId/test`; `GET/PUT /api/teams/:id/alert-rules`; `GET /api/teams/:id/alert-history` |

## Mock Services

The mock services package generates a realistic tiered service topology for demonstrating and testing the dashboard's dependency monitoring capabilities.

### Running Mock Services

```bash
# Start with default 20 services
npm run mock:start

# Start with custom service count
npm run mock:start -- --count=50

# Start and seed services to dashboard database
npm run mock:seed -- --count=50

# Reset database and regenerate topology
npm run mock:reset
```

### Control Panel

Access the control panel at http://localhost:3010 to:
- View the service topology organized by tier (Frontend, API, Backend, Database)
- Click services to view details and dependencies
- Inject failures into individual services
- Apply predefined failure scenarios
- Clear failures and reset topology

### Service Endpoints

Each mock service exposes:
- `GET /{service-name}/health` - Health check (200 OK or 503 Service Unavailable)
- `GET /{service-name}/dependencies` - Dependency status JSON (proactive-deps format)
- `GET /{service-name}/metrics` - Prometheus metrics

### Failure Modes

| Mode | Description |
|------|-------------|
| `outage` | Service returns 503 for all requests |
| `high_latency` | Adds configurable delay (default 3000ms) |
| `error` | Service returns 500 errors |
| `intermittent` | Random failures (~50% error rate) |

### Cascading Failures

When a failure is injected with cascade enabled, all services that depend on the failed service will also become unhealthy. The UI distinguishes between:
- **Injected** - Failure was directly applied to this service
- **Cascaded** - Failure propagated from an upstream dependency

### Predefined Scenarios

- **Database Outage** - All database tier services fail
- **API Degradation** - API tier experiences high latency
- **Partial Outage** - Random 30% of services fail

### CLI Options

```bash
cd mock-services
npm run dev -- [options]

Options:
  --count, -c     Number of services to generate (default: 20)
  --port, -p      Server port (default: 4000)
  --seed, -s      Seed services to dashboard database
  --reset, -r     Clear existing mock services and regenerate
  --db-path       Path to dashboard database (default: ../server/data/database.sqlite)
```

## Security

### Security Headers

All responses include security headers via [Helmet](https://helmetjs.github.io/):

- **Content-Security-Policy** — `default-src 'self'`, inline styles allowed (React Flow), `object-src 'none'`, `frame-ancestors 'none'`. In development, `'unsafe-eval'` and `ws:` are added for Vite HMR.
- **X-Frame-Options** — `DENY`
- **X-Content-Type-Options** — `nosniff`
- **Strict-Transport-Security** — Production only, `max-age=31536000; includeSubDomains`
- **Referrer-Policy**, **X-DNS-Prefetch-Control**, etc. — Helmet defaults

### HTTPS & Proxy Hardening

When deployed behind a reverse proxy (nginx, AWS ALB, etc.):

1. Set `TRUST_PROXY` so Express reads `X-Forwarded-*` headers for `req.secure`, `req.ip`, etc.
2. Optionally set `REQUIRE_HTTPS=true` to 301-redirect all HTTP traffic to HTTPS (except `/api/health` for load-balancer probes).
3. Session and CSRF cookies automatically set `Secure` flag based on the actual connection protocol (`req.secure`), so they work correctly behind TLS-terminating proxies.

### SSRF Protection

Health endpoint URLs are validated against private/reserved IP ranges (RFC 1918, link-local, loopback, multicast, etc.) at two points: service creation/update time (synchronous hostname and IP check) and poll time (DNS resolution to catch DNS rebinding attacks). This prevents the server from being used to probe internal infrastructure or access cloud metadata endpoints (169.254.169.254).

Since this app is designed to monitor internal services, a configurable **`SSRF_ALLOWLIST`** env var lets you open specific ranges while keeping the full block list as a default:

```bash
# Local development
SSRF_ALLOWLIST=localhost,127.0.0.0/8

# Corporate network
SSRF_ALLOWLIST=*.internal,*.corp.com,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8,localhost
```

Supported formats: exact hostnames (`localhost`), wildcard patterns (`*.internal`), and CIDR ranges (`10.0.0.0/8`). Cloud metadata IPs are only allowed if explicitly included in the allowlist.

### CSRF Protection

All mutating API routes are protected by a double-submit cookie pattern. The server sets a `csrf-token` cookie readable by JavaScript; the client reads it and sends it back as an `X-CSRF-Token` header on POST/PUT/DELETE requests. The middleware validates that they match. This prevents cross-site request forgery without requiring additional dependencies.

### Session Secret Validation

In production (`NODE_ENV=production`), the server refuses to start if `SESSION_SECRET` is missing, matches a known weak default, or is shorter than 32 characters. This prevents accidental deployment with insecure session signing.

### Rate Limiting

All API endpoints are protected by in-memory rate limiting via `express-rate-limit`:

- **Global limit:** 100 requests per 15 minutes per IP (configurable via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`)
- **Auth limit:** 10 requests per minute per IP on `/api/auth` endpoints (configurable via `AUTH_RATE_LIMIT_WINDOW_MS` and `AUTH_RATE_LIMIT_MAX`)

The global rate limiter runs before session middleware to reject abusive requests early without session creation cost. Rate-limited responses return `429 Too Many Requests` with standard `RateLimit-*` and `Retry-After` headers.

### Poll DDoS Protection

The polling service includes per-hostname concurrency limiting and request deduplication to prevent abuse:

- **Host rate limiting:** Max 3 concurrent polls per target hostname (configurable via `POLL_MAX_CONCURRENT_PER_HOST`). Services that can't acquire a slot are skipped and retried on the next 5-second tick.
- **Poll deduplication:** Services sharing the same health endpoint URL share a single HTTP request per poll cycle. Each service maintains independent circuit breaker and backoff state.

### Redirect Validation

Logout redirect URLs are validated to prevent open redirect attacks. Only relative paths, same-origin URLs, and external HTTPS URLs (for OIDC end-session endpoints) are allowed.

## License

MIT
