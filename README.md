# Dependencies Dashboard

A dashboard to review and manage all tracked dependencies and services. Monitor service health, visualize dependency relationships, and track issues across teams.

## Features

- **Dashboard Overview** — Summary of service health across all teams with quick links to issues and recent activity
- **Service Management** — Register services with health endpoints, view dependency status, trigger manual polls, and track error/latency history
- **Dependency Graph** — Interactive visualization (React Flow) of service dependencies with team filtering, search/highlight, layout controls, and latency threshold filtering
- **Wallboard** — Real-time status board with service health cards, team filtering, and unhealthy-only view
- **Team Management** — Organize services by team, manage members and roles (lead/member)
- **User Administration** — Admin panel for managing users, roles, and account status
- **Auto-Polling** — Server-side health polling on a 30-second cycle with exponential backoff on failures; client-side auto-refresh with configurable intervals (10s, 20s, 30s, 1m)
- **Dependency Associations** — Automatic suggestion engine that links dependencies to services using name matching, hostname matching, token overlap, and string similarity with confidence scoring
- **Error & Latency History** — Historical tracking of dependency errors and latency with trend analysis
- **OIDC Authentication** — OpenID Connect integration with optional dev bypass mode
- **Role-Based Access Control** — Admin, team lead, and member roles with scoped permissions

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, CSS Modules, React Flow
- **Backend:** Express.js, TypeScript, SQLite (better-sqlite3)
- **Authentication:** OpenID Connect (openid-client), express-session
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
| `SESSION_SECRET` | — | Session secret (change in production) |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `OIDC_ISSUER_URL` | — | OIDC provider issuer URL |
| `OIDC_CLIENT_ID` | — | OAuth2 client ID |
| `OIDC_CLIENT_SECRET` | — | OAuth2 client secret |
| `OIDC_REDIRECT_URI` | `http://localhost:3001/api/auth/callback` | OAuth2 callback URL |
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
│       │   ├── common/          # StatusBadge, Modal, ConfirmDialog, ErrorHistoryPanel
│       │   └── pages/
│       │       ├── Dashboard/       # Health summary overview
│       │       ├── Services/        # Service list, detail, and form
│       │       ├── Teams/           # Team list, detail, and form
│       │       ├── DependencyGraph/ # Interactive graph visualization
│       │       ├── Wallboard/       # Real-time status board
│       │       └── Admin/           # User management
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
Interactive graph built with React Flow. Controls include team filter, search/highlight, horizontal/vertical layout, tier spacing, latency threshold slider, and minimap.

### Wallboard (`/wallboard`)
Status board showing service health cards with latency stats, impact info, and poll failure indicators. Supports team filtering and unhealthy-only view. Filter preferences persist in localStorage.

### User Management (`/admin/users`)
Admin-only page for managing user accounts: search, filter by status, toggle admin role, deactivate/reactivate users.

## API Overview

All endpoints require authentication unless noted. Admin endpoints require the admin role.

| Area | Endpoints |
|------|-----------|
| Auth | `GET /api/auth/login`, `/callback`, `/me`; `POST /api/auth/logout` |
| Users | `GET /api/users`, `GET /api/users/:id`, `PUT /api/users/:id/role`, `POST /api/users/:id/reactivate`, `DELETE /api/users/:id` |
| Teams | CRUD on `/api/teams`, member management via `/api/teams/:id/members` |
| Services | CRUD on `/api/services`, `POST /api/services/:id/poll` for manual polling |
| Associations | `/api/dependencies/:id/associations`, suggestion generation and accept/dismiss |
| Graph | `GET /api/graph` with optional `team`, `service`, `dependency` filters |
| History | `GET /api/latency/:dependencyId`, `GET /api/errors/:dependencyId` |

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

Access the control panel at http://localhost:4000/control/ to:
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

## License

MIT
