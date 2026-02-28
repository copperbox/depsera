<p align="center">
  <img src="./docs/depsera-logo.svg" alt="Depsera" width="800" />
</p>

A dependency monitoring and service health dashboard. Track service health across your organization, visualize dependency relationships, and get alerted when things break.

## Quick Start

The fastest way to get running is with Docker Compose:

```bash
git clone https://github.com/copperbox/depsera
cd depsera

# Edit docker-compose.yml to set SESSION_SECRET and admin credentials
docker compose up -d
```

Open `http://localhost:3001` in your browser and log in with the admin credentials you configured.

For detailed deployment options (bare Node.js, reverse proxy, backups), see the [Installation Guide](docs/installation.md).

## Features

**Health Monitoring**
- Register services with health check endpoints and poll them on configurable intervals (5s to 1hr)
- Exponential backoff on failures with circuit breaker protection (opens after 10 consecutive failures)
- Custom schema mapping for non-standard health endpoints, including object-keyed formats (Spring Boot Actuator, ASP.NET Health Checks, etc.) with skipped-check support
- Contact info and impact overrides with 3-tier merge hierarchy (instance > canonical > polled) — resolved in API responses
- Per-hostname concurrency limiting and request deduplication prevent polling abuse

**Visualization**
- Interactive dependency graph (React Flow) with team filtering, search, layout controls, automatic high-latency detection, and isolated tree view
- Latency charts (min/avg/max over time) and health timeline swimlanes per dependency
- Edge selection shows per-dependency latency chart, contact info, impact, and error history
- Node selection shows aggregate latency chart across all dependents and merged contact info
- Dependency-focused wallboard showing all dependencies deduplicated by canonical name with aggregated health, latency, and reporting services — click any card for charts and drill-down. Skipped dependencies are displayed with a distinct status indicator
- Dashboard with health distribution, services with issues, polling issues aggregation, and team health summaries

**Team Management**
- Organize services by team with lead/member roles
- Team-scoped service access — non-admin users see only their team's services
- Association engine automatically suggests links between dependencies and services
- External service registry for unmonitored third-party dependencies (shown in graph and association dropdowns)

**Alerting**
- Slack notifications with Block Kit formatting and deep links
- Generic webhook sender with custom headers and configurable HTTP method
- Severity-based alert rules (critical, warning, all) per team
- Flap protection and per-team hourly rate limiting
- Full alert delivery history (sent, failed, suppressed)

**Manifest Sync & Drift Detection**
- Declarative service configuration via JSON manifest URL per team
- Automated sync engine: fetch, validate, diff, and apply service definitions
- Field-level drift detection when local edits diverge from the manifest
- Sync policies: configurable behavior for field drift (flag/manifest wins/local wins) and service removal (flag/deactivate/delete)
- Drift review inbox with accept, dismiss, reopen, and bulk actions
- Scheduled sync (default hourly) with manual trigger and 60s cooldown
- Full sync history with per-entry detail

**Security**
- OIDC/SSO authentication with PKCE or local username/password auth
- RBAC with admin, team lead, and member roles
- SSRF protection with configurable allowlist for internal networks
- CSRF protection, rate limiting, security headers (CSP, HSTS, X-Frame-Options)
- Audit trail for all admin actions
- Direct HTTPS support with custom or auto-generated self-signed certificates
- Session secret validation, redirect URL validation, timing-safe comparisons

**Operations**
- SQLite database — zero external dependencies, sessions survive restarts
- Automatic data retention cleanup (configurable period, default 365 days)
- Runtime-configurable admin settings (retention, polling, rate limits, alerts)
- Structured JSON logging in production via pino
- Docker image with health check and volume-mounted data

## Architecture

```
                            +---------------------+
                            |  Browser (React SPA) |
                            +----------+----------+
                                       |
                              HTTPS (optional)
                                       |
                            +----------v----------+
                            |   Reverse Proxy      |
                            |  (nginx / Caddy)     |
                            +----------+----------+
                                       |
                            +----------v----------+
                            |   Express Server     |
                            |   (port 3001)        |
                            |                      |
                            |  +----------------+  |
                            |  | Static Files   |  |  client/dist/
                            |  +----------------+  |
                            |  | REST API       |  |  /api/*
                            |  +----------------+  |
                            |  | Health Poller  |  |  background service
                            |  +----------------+  |
                            |  | Alert Engine   |  |  event-driven
                            |  +----------------+  |
                            |  | Retention Job  |  |  daily cleanup
                            |  +----------------+  |
                            +----------+----------+
                                       |
                            +----------v----------+
                            |   SQLite Database    |
                            |  (server/data/)      |
                            +---------------------+
```

**Monorepo layout:**

| Directory | Description |
|-----------|-------------|
| `client/` | React 18 + TypeScript + Vite SPA |
| `server/` | Express.js + TypeScript + SQLite REST API |
| `docs/` | Installation guide, API reference, specs |

**Development:** Two processes — Vite dev server on `:3000` (proxies `/api/*` to backend), Express on `:3001`.

**Production:** Single process — Express serves the built client from `client/dist/` with compression and SPA catch-all routing.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, CSS Modules, React Flow, Recharts
- **Backend:** Express.js, TypeScript, SQLite (better-sqlite3)
- **Authentication:** OpenID Connect (openid-client) or local auth (bcryptjs)
- **Testing:** Jest, React Testing Library
- **Logging:** pino + pino-http

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Install all dependencies (root, server, and client)
npm run install:all
```

### Configuration

Copy the example env file and configure:

```bash
cp server/.env.example server/.env
```

**Core settings:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `DATABASE_PATH` | `./data/database.sqlite` | SQLite database location |
| `SESSION_SECRET` | — | Session signing secret (32+ chars required in production) |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |

**Authentication (choose one):**

| Variable | Default | Description |
|----------|---------|-------------|
| `LOCAL_AUTH` | `false` | Set `true` for local username/password auth |
| `ADMIN_EMAIL` | — | Initial admin email (required on first startup with `LOCAL_AUTH=true`) |
| `ADMIN_PASSWORD` | — | Initial admin password, min 8 chars (required on first startup with `LOCAL_AUTH=true`) |
| `OIDC_ISSUER_URL` | — | OIDC provider issuer URL |
| `OIDC_CLIENT_ID` | — | OAuth2 client ID |
| `OIDC_CLIENT_SECRET` | — | OAuth2 client secret |
| `OIDC_REDIRECT_URI` | `http://localhost:3001/api/auth/callback` | OAuth2 callback URL |

**Security & networking:**

| Variable | Default | Description |
|----------|---------|-------------|
| `SSRF_ALLOWLIST` | — | Comma-separated hostnames, wildcards (`*.internal`), CIDRs (`10.0.0.0/8`) |
| `TRUST_PROXY` | — | Express trust proxy setting (`true`, hop count, IP/subnet, `loopback`) |
| `REQUIRE_HTTPS` | `false` | Set `true` to redirect HTTP to HTTPS |
| `ENABLE_HTTPS` | `false` | Direct HTTPS without a reverse proxy (generates self-signed cert if no cert paths given) |
| `SSL_CERT_PATH` | — | PEM certificate path (pair with `SSL_KEY_PATH`) |
| `SSL_KEY_PATH` | — | PEM private key path (pair with `SSL_CERT_PATH`) |
| `HTTP_PORT` | — | Plain HTTP port for health checks + redirect when `ENABLE_HTTPS=true` |
| `RATE_LIMIT_MAX` | `100` | Max requests per IP per 15-minute window |
| `AUTH_RATE_LIMIT_MAX` | `10` | Max auth requests per IP per minute |

**Operations:**

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_RETENTION_DAYS` | `365` | Days to keep latency, error, and audit log history |
| `RETENTION_CLEANUP_TIME` | `02:00` | Daily cleanup time (HH:MM, local time) |
| `POLL_MAX_CONCURRENT_PER_HOST` | `5` | Max concurrent polls per target hostname |
| `LOG_LEVEL` | `info` | Log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |
| `APP_BASE_URL` | — | Base URL for deep links in alert messages |

See `server/.env.example` for the full list with comments. Additional settings are configurable at runtime via the admin settings UI (`/admin/settings`).

### Development

```bash
# Run server and client concurrently
npm run dev

# Or run them separately:
npm run dev:server  # Backend on http://localhost:3001
npm run dev:client  # Frontend on http://localhost:3000
```

### Database

```bash
# Run from /server directory
npm run db:migrate    # Run pending migrations
npm run db:rollback   # Rollback last migration
npm run db:status     # Show migration status
```

### Testing

```bash
npm test              # All tests
npm run test:server   # Server tests only
npm run test:client   # Client tests only
```

### Building

```bash
npm run build         # Build both packages
```

### Linting

```bash
npm run lint          # Lint both packages
```

### Docker

```bash
# Docker Compose (recommended)
docker compose up -d

# Or run directly
docker run -d \
  -p 3001:3001 \
  -v depsera-data:/app/server/data \
  -e SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))") \
  -e LOCAL_AUTH=true \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_PASSWORD=changeme123 \
  depsera
```

SQLite data is persisted via a Docker volume at `/app/server/data`. Set `LOCAL_AUTH=true` for standalone deployment or provide OIDC env vars for SSO.

### Production (Bare Node.js)

```bash
npm run build
cd server && npm start
```

The server auto-detects the built client at `client/dist/` and serves it with compression. No separate web server is required.

For production deployments with reverse proxy (nginx/Caddy), backup procedures, and process management, see the [Installation Guide](docs/installation.md).

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — health distribution, services with issues, polling issues (schema warnings + poll failures), team health summaries |
| `/services` | Service list (team-scoped) with search and team filter; service detail with dependencies, charts, poll issues history, inline alias management (admin), and manual poll |
| `/teams` | Team list with member/service counts; team detail with member management, manifest status, alert channels, rules, and history |
| `/teams/:id/manifest` | Manifest configuration, last sync result, drift review inbox, and sync history |
| `/graph` | Interactive dependency graph with team filter, search, layout controls, automatic high-latency detection, and isolated tree view (right-click or detail panel) |
| `/associations` | Suggestions inbox (card-based, one per dependency), manage associations (accordion browser with inline create/delete), alias management, and external service registry |
| `/wallboard` | Real-time status board with health cards, team filter, and unhealthy-only view |
| `/admin/users` | User management (admin only); create users and reset passwords in local auth mode |
| `/admin/settings` | Runtime settings (admin only) — data retention, polling, rate limits, alerts |

## API

All endpoints require authentication unless noted. Admin endpoints require the admin role. Full documentation with request/response schemas and curl examples: **[API Reference](docs/api-reference.md)**.

| Area | Endpoints |
|------|-----------|
| Health | `GET /api/health` |
| Auth | `GET /api/auth/mode`, `/login`, `/callback`, `/me`; `POST /api/auth/login` (local), `/logout` |
| Services | CRUD on `/api/services` (team-scoped), `POST /:id/poll`, `POST /test-schema` |
| External Services | CRUD on `/api/external-services` (team-scoped) — unmonitored service entries for association targets |
| Teams | CRUD on `/api/teams`, member management via `/:id/members` |
| Users | CRUD on `/api/users` (admin), `POST` and `PUT /:id/password` (local auth) |
| Aliases | CRUD on `/api/aliases` (admin for mutations), `GET /canonical-names` |
| Overrides | `GET/PUT/DELETE /api/canonical-overrides/:name`, `PUT/DELETE /api/dependencies/:id/overrides` |
| Associations | CRUD on `/api/dependencies/:id/associations`, suggestion generate/accept/dismiss |
| Graph | `GET /api/graph` with `team`, `service`, `dependency` filters |
| History | `GET /api/latency/:id` + `/buckets`, `GET /api/errors/:id`, `GET /api/dependencies/:id/timeline`, `GET /api/services/:id/poll-history` |
| Admin | `GET/PUT /api/admin/settings`, `GET /api/admin/audit-log` |
| Manifest | `GET/PUT/DELETE /api/teams/:id/manifest`, `POST /:id/manifest/sync`, `GET /:id/manifest/sync-history`, `POST /api/manifest/validate` |
| Drift Flags | `GET /api/teams/:id/drifts` + `/summary`, `PUT /:driftId/accept` + `/dismiss` + `/reopen`, `POST /bulk-accept` + `/bulk-dismiss` |
| Alerts | CRUD on `/api/teams/:id/alert-channels` + `/test`, `GET/PUT /:id/alert-rules`, `GET /:id/alert-history` |

## Security

Depsera includes defense-in-depth security:

- **Security headers** via Helmet (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- **SSRF protection** on health endpoints with private IP blocking and DNS rebinding prevention; configurable allowlist for internal networks
- **CSRF protection** via double-submit cookie pattern
- **Rate limiting** — global (100 req/15min) and auth-specific (10 req/min) per IP
- **Session secret validation** — production startup refuses weak or missing secrets
- **Redirect validation** prevents open redirect attacks on logout
- **Body size limit** (100KB) on JSON payloads
- **Timing-safe comparisons** for OIDC state parameter
- **SQLite durability** — `synchronous = FULL` and WAL autocheckpoint
- **Static security analysis** via `eslint-plugin-security`
- **Audit trail** for all admin actions with actor, action, resource, and IP address
- **Poll DDoS protection** — per-hostname concurrency limiting and request deduplication

For proxy/HTTPS configuration, see the [Installation Guide](docs/installation.md).

## Documentation

| Document | Description |
|----------|-------------|
| [Installation Guide](docs/installation.md) | Docker, Docker Compose, bare Node.js, reverse proxy, backups |
| [Admin Guide](docs/admin-guide.md) | First-run setup, user/team management, alerts, settings, troubleshooting |
| [API Reference](docs/api-reference.md) | All REST endpoints with request/response schemas and curl examples |
| [Manifest Schema Reference](docs/manifest-schema.md) | Full manifest JSON schema, validation rules, sync policies, and example manifests |
| [Health Endpoint Spec](docs/health-endpoint-spec.md) | Proactive-deps format, custom schema mapping, examples (Spring Boot, ASP.NET) |
| [Testing with Keycloak](docs/testing-with-keycloak.md) | Local Keycloak OIDC testing with Docker Compose |
| [Testing with Auth0](docs/testing-with-auth0.md) | OIDC testing with Auth0 (free tier) |

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
