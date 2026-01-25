# Dependencies Dashboard

A dashboard to review and manage all tracked dependencies and services.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, CSS Modules
- **Backend:** Express.js, TypeScript, SQLite
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

### Development

```bash
# Run server, client, and mock services in development mode
npm run dev

# Or run them separately:
npm run dev:server  # Starts backend on http://localhost:3001
npm run dev:client  # Starts frontend on http://localhost:3000
npm run dev:mock    # Starts mock services on http://localhost:4000
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
├── client/          # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── server/          # Express backend
│   ├── src/
│   │   ├── db/
│   │   ├── routes/
│   │   └── index.ts
│   └── package.json
├── mock-services/   # Mock service topology simulator
│   ├── src/
│   │   ├── topology/    # Service topology generator
│   │   ├── services/    # Mock service implementations
│   │   ├── failures/    # Failure injection engine
│   │   ├── control/     # Control API
│   │   ├── ui/          # Control panel UI
│   │   └── seed/        # Dashboard DB seeding
│   └── package.json
└── package.json     # Root scripts
```

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
