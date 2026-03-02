# Onboarding Guide

A step-by-step guide for engineering teams onboarding their services to Depsera. This guide walks you through instrumenting your services, registering them, building a dependency graph, and setting up alerts.

**Audience:** DevOps engineers, backend engineers, and site reliability engineers setting up dependency monitoring.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Step 1: Create Your Team](#step-1-create-your-team)
- [Step 2: Instrument Your Services](#step-2-instrument-your-services)
  - [What Makes a Good Dependency Check](#what-makes-a-good-dependency-check)
  - [Option A: Use proactive-deps](#option-a-use-proactive-deps)
  - [Option B: Build Your Own Health Endpoint](#option-b-build-your-own-health-endpoint)
  - [Option C: Use an Existing Health Endpoint with Custom Schema Mapping](#option-c-use-an-existing-health-endpoint-with-custom-schema-mapping)
- [Step 3: Register Your Services](#step-3-register-your-services)
  - [Manual Registration via UI](#manual-registration-via-ui)
  - [Manifest-Driven Registration (Recommended)](#manifest-driven-registration-recommended)
- [Step 4: Build Your Dependency Graph](#step-4-build-your-dependency-graph)
- [Step 5: Set Up Alerts](#step-5-set-up-alerts)
- [Next Steps](#next-steps)

---

## Prerequisites

Before you begin:

1. **A running Depsera instance.** See the [Installation Guide](installation.md) for Docker Compose, bare Node.js, or production deployment options.
2. **An admin account.** The admin will create your team and assign your first team lead. See the [Admin Guide](admin-guide.md) for first-run setup.
3. **Network access** from the Depsera server to your services' health endpoints. If your services are on internal networks, the admin will need to configure the [SSRF allowlist](admin-guide.md#ssrf-allowlist).

---

## Step 1: Create Your Team

Teams are the organizational unit in Depsera. Services belong to teams, and access control is scoped to team membership.

**Admin creates the team:**

1. Navigate to `/teams` and click **Create Team**
2. Enter a team name and optional description
3. Click **Save**

**Add members and assign leads:**

1. On the team detail page, click **Add Member**
2. Select a user and assign their role:

| Role | Permissions |
|------|-------------|
| **Lead** | Create, edit, delete, and poll services. Manage alert channels and rules. Manage team members. Configure manifests. |
| **Member** | View team services and dependencies. Trigger manual polls. Read-only access to alerts. |

Designate at least one **lead** — this is typically the DevOps or SRE engineer responsible for managing the team's services in Depsera. Leads handle service registration, manifest configuration, and alert setup. All remaining steps in this guide require the lead role.

---

## Step 2: Instrument Your Services

Before registering a service in Depsera, it needs to expose a health endpoint that reports the status of its dependencies. This is the most important step — the quality of your dependency checks determines the value you get from Depsera.

### What Makes a Good Dependency Check

**A dependency check should verify that your service can actually use the dependency, not just that the dependency is reachable.**

The difference matters. When a database connection is misconfigured, the database host may still respond to pings and its `/healthcheck` route may return 200. But your service can't query it. When an API changes its response contract, it still returns 200 — but your service can't parse the response.

Depsera builds a dependency tree from these checks. If your checks only verify that a hostname resolves or a port is open, the tree tells you nothing useful. Real checks give you early warning that a connection between two services is degrading before it causes an outage.

**Good dependency checks:**

| Dependency | Check | Why |
|------------|-------|-----|
| PostgreSQL | Execute `SELECT 1` or run a lightweight stored procedure | Proves the connection is authenticated, the database accepts queries, and the connection pool is functional |
| Redis | `PING` command and verify `PONG` response | Proves the cache is reachable and responding to commands |
| RabbitMQ | Verify channel is open, optionally publish/consume a test message | Proves the broker accepts connections and messages can flow |
| Downstream REST API | Call a known endpoint and validate the response shape (e.g., status code, expected fields present) | Proves the API is not just alive but returning data your service can actually use |
| gRPC service | Invoke the `grpc.health.v1.Health/Check` RPC or a lightweight method | Proves the service is accepting RPC calls on the expected interface |
| S3 / object storage | `HeadBucket` or `ListObjectsV2` with `max-keys=1` | Proves credentials are valid and the bucket is accessible |

**Bad dependency checks:**

| Check | Problem |
|-------|---------|
| `curl http://postgres-host:5432` | Proves the port is open, not that your service can authenticate or query |
| `HTTP GET /healthcheck` on a downstream service | Only tells you the downstream service considers itself healthy — says nothing about whether your service can call it successfully |
| DNS resolution of a hostname | Proves DNS works, not that the dependency does |
| TCP connect to a port | Proves network connectivity, nothing more |

The goal: each dependency check should exercise the **contract** between your service and the dependency. If that contract breaks, the check should fail.

### Option A: Use proactive-deps

[proactive-deps](https://github.com/copperbox/proactive-deps) is an npm package by Copperbox (the makers of Depsera) that handles cached, proactive dependency health checks with built-in Prometheus metrics.

```bash
npm install proactive-deps
```

```typescript
import { DependencyMonitor, SUCCESS_STATUS_CODE, ERROR_STATUS_CODE } from 'proactive-deps';

const monitor = new DependencyMonitor({
  checkIntervalMs: 15000,   // How often checks run in the background
  cacheDurationMs: 60000,   // How long results are cached
  refreshThresholdMs: 5000, // Refresh cache this many ms before expiry
});

// Register a database check
monitor.register({
  name: 'PostgreSQL',
  description: 'Primary transactional database',
  impact: 'Payments cannot be processed, transactions will fail',
  contact: { email: 'db-team@example.com', slack: '#db-support' },
  checkDetails: { type: 'database', host: 'pg-main.internal', port: 5432 },
  check: async () => {
    try {
      await pool.query('SELECT 1');
      return SUCCESS_STATUS_CODE;
    } catch (error) {
      return { code: ERROR_STATUS_CODE, error, errorMessage: 'Database query failed' };
    }
  }
});

// Register a downstream API check
monitor.register({
  name: 'Payment Gateway',
  description: 'Stripe payment processing',
  impact: 'Card payments will fail for all customers',
  checkDetails: { type: 'rest', url: 'https://api.stripe.com/v1/balance', method: 'GET' },
  check: async () => {
    try {
      const res = await fetch('https://api.stripe.com/v1/balance', {
        headers: { Authorization: `Bearer ${process.env.STRIPE_KEY}` }
      });
      const body = await res.json();
      // Validate the response contract — not just the status code
      if (!res.ok || !body.available || !Array.isArray(body.available)) {
        return { code: ERROR_STATUS_CODE, errorMessage: 'Unexpected response shape' };
      }
      return SUCCESS_STATUS_CODE;
    } catch (error) {
      return { code: ERROR_STATUS_CODE, error, errorMessage: 'Payment gateway unreachable' };
    }
  }
});

// Register a cache check
monitor.register({
  name: 'Redis',
  description: 'Session and rate-limit cache',
  impact: 'Sessions will fall back to DB, increased latency',
  check: async () => {
    try {
      const pong = await redis.ping();
      if (pong !== 'PONG') {
        return { code: ERROR_STATUS_CODE, errorMessage: `Unexpected response: ${pong}` };
      }
      return SUCCESS_STATUS_CODE;
    } catch (error) {
      return { code: ERROR_STATUS_CODE, error, errorMessage: 'Redis unreachable' };
    }
  }
});

// Start the background check loop
monitor.startDependencyCheckInterval();

// Expose the health endpoint — return the statuses array directly
app.get('/health/dependencies', async (req, res) => {
  const statuses = await monitor.getAllStatuses();
  res.json(statuses);
});
```

`getAllStatuses()` returns a JSON array in exactly the format Depsera expects — no schema mapping needed. Point Depsera at your `/health/dependencies` route and it works out of the box. The monitor also exposes `getPrometheusMetrics()` for scraping latency and health gauges.

See the [proactive-deps documentation](https://github.com/copperbox/proactive-deps) for the full API reference.

### Option B: Build Your Own Health Endpoint

If you're not using Node.js, or prefer to build your own, expose an endpoint that returns a JSON array of dependency status objects.

**Minimal format** — just `name` and `healthy`:

```json
[
  { "name": "PostgreSQL", "healthy": true },
  { "name": "Redis", "healthy": true },
  { "name": "Payment Gateway", "healthy": false }
]
```

**Full format** — all available fields:

```json
[
  {
    "name": "PostgreSQL",
    "healthy": true,
    "description": "Primary transactional database",
    "impact": "critical",
    "type": "database",
    "contact": {
      "email": "db-team@example.com",
      "slack": "#db-support"
    },
    "health": {
      "state": 0,
      "code": 200,
      "latency": 12
    },
    "lastChecked": "2026-03-01T10:30:00.000Z"
  }
]
```

**Health states:**

| Value | Name | Description |
|-------|------|-------------|
| `0` | OK | Healthy |
| `1` | WARNING | Degraded but functional |
| `2` | CRITICAL | Down or non-functional |

If you only provide `healthy` (boolean), Depsera derives the state automatically: `true` → OK (0), `false` → CRITICAL (2).

For the complete field reference, see the [Health Endpoint Spec](health-endpoint-spec.md).

**Example in Python (Flask):**

```python
@app.route('/health/dependencies')
def dependency_health():
    checks = []

    # Database check — execute a real query
    try:
        start = time.time()
        db.session.execute(text('SELECT 1'))
        latency = int((time.time() - start) * 1000)
        checks.append({
            'name': 'PostgreSQL',
            'healthy': True,
            'type': 'database',
            'impact': 'critical',
            'health': { 'state': 0, 'latency': latency }
        })
    except Exception as e:
        checks.append({
            'name': 'PostgreSQL',
            'healthy': False,
            'type': 'database',
            'impact': 'critical',
            'health': { 'state': 2 },
            'errorMessage': str(e)
        })

    # Downstream API check — validate response contract
    try:
        start = time.time()
        resp = requests.get('https://users-api.internal/v1/health', timeout=5)
        latency = int((time.time() - start) * 1000)
        body = resp.json()
        healthy = resp.status_code == 200 and 'status' in body
        checks.append({
            'name': 'Users API',
            'healthy': healthy,
            'type': 'rest',
            'impact': 'critical',
            'health': { 'state': 0 if healthy else 2, 'latency': latency }
        })
    except Exception as e:
        checks.append({
            'name': 'Users API',
            'healthy': False,
            'type': 'rest',
            'impact': 'critical',
            'errorMessage': str(e)
        })

    return jsonify(checks)
```

### Option C: Use an Existing Health Endpoint with Custom Schema Mapping

If your services already expose health endpoints in a different format (Spring Boot Actuator, ASP.NET Health Checks, or a custom structure), you don't need to change them. Depsera supports **custom schema mappings** that tell it how to extract dependency data from your existing response format.

A schema mapping has two parts:

1. **Root path** — dot-notation path to the array or object containing dependency checks
2. **Field mappings** — which fields map to name, healthy, latency, etc.

**Spring Boot Actuator example:**

Your `/actuator/health` returns:
```json
{
  "status": "UP",
  "components": {
    "db": { "status": "UP", "details": { "database": "PostgreSQL" } },
    "redis": { "status": "UP" },
    "diskSpace": { "status": "UP" }
  }
}
```

Schema mapping:
```json
{
  "root": "components",
  "fields": {
    "name": "$key",
    "healthy": { "field": "status", "equals": "UP" }
  }
}
```

The `$key` sentinel uses the object key (`db`, `redis`, `diskSpace`) as the dependency name. The boolean comparison checks if `status` equals `"UP"`.

**ASP.NET Health Checks example:**

Your `/health` returns:
```json
{
  "status": "Healthy",
  "entries": {
    "sqlserver": { "status": "Healthy", "description": "SQL Server connection" },
    "redis": { "status": "Degraded", "description": "Redis connectivity" }
  }
}
```

Schema mapping:
```json
{
  "root": "entries",
  "fields": {
    "name": "$key",
    "healthy": { "field": "status", "equals": "Healthy" },
    "description": "description"
  }
}
```

**Custom nested format example:**

Your endpoint returns:
```json
{
  "data": {
    "checks": [
      { "serviceName": "Payment Gateway", "isActive": true, "metrics": { "latencyMs": 45 } },
      { "serviceName": "Email Provider", "isActive": false, "metrics": { "latencyMs": 0 } }
    ]
  }
}
```

Schema mapping:
```json
{
  "root": "data.checks",
  "fields": {
    "name": "serviceName",
    "healthy": "isActive",
    "latency": "metrics.latencyMs"
  }
}
```

You can test any schema mapping before saving it — see [Testing Schema Mappings](#testing-your-schema-mapping) below.

For the full schema mapping reference including boolean comparisons, dot-notation paths, and healthy value coercion, see the [Health Endpoint Spec](health-endpoint-spec.md#custom-schema-mapping).

> **Important:** Even when using custom schema mappings, the underlying checks should still be real dependency checks, not just cluster healthcheck routes. Schema mapping changes how Depsera reads the data — it doesn't change what your checks actually verify.

---

## Step 3: Register Your Services

Once your services expose dependency health endpoints, register them in Depsera so polling begins. You have two options:

### Manual Registration via UI

Best for getting started quickly or registering a handful of services.

**1. Navigate to Services and create a new service:**

Navigate to `/services` and click **Create Service**. The form only shows teams you lead — if you lead a single team, it's pre-selected. Fill in:

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Human-readable display name (e.g., "Payment API") |
| **Health Endpoint** | Yes | The URL Depsera will poll (e.g., `https://payment-api.internal/health/dependencies`) |
| **Description** | No | What this service does |
| **Metrics Endpoint** | No | Optional URL for metrics data |
| **Poll Interval** | No | How often to poll (5s to 1hr). Defaults to the server-configured default (typically 30s). |

**2. Configure the health endpoint format:**

In the **Health Endpoint Format** section, choose one of:

- **Default (proactive-deps)** — if your endpoint returns the standard JSON array format. No configuration needed.
- **Custom schema** — if your endpoint uses a different format. Fill in the schema mapping fields using the guided form (root path, name field, healthy field, etc.).

**3. Test your schema mapping (if using custom schema):**

Before saving, click **Test mapping** to fetch your endpoint and preview the parsed results. You'll see:
- A table of parsed dependencies with their health status, latency, and impact
- Any warnings (missing fields, empty results, etc.)

Fix any issues before saving. This is a dry run — nothing is stored until you save.

**4. Save and verify:**

Click **Save**. Depsera immediately starts polling your service at the configured interval. Navigate to the service detail page to see dependencies appearing as polls complete.

### Manifest-Driven Registration (Recommended)

For teams with many services or those who want to manage service configuration as code, manifest-driven registration is the recommended approach. Define your services in a JSON file, host it at a URL, and Depsera syncs automatically.

**Benefits over manual registration:**

- **Version-controlled** — review changes through PRs, track history in git
- **Automatable** — generate the manifest from your service catalog, CI/CD pipeline, or infrastructure-as-code
- **Bulk management** — add, update, or remove multiple services in a single change
- **Drift detection** — Depsera flags when local edits diverge from the manifest

**1. Create your manifest file:**

```json
{
  "version": 1,
  "services": [
    {
      "key": "payment-api",
      "name": "Payment API",
      "health_endpoint": "https://payment-api.internal/health/dependencies",
      "description": "Handles payment processing",
      "poll_interval_ms": 15000
    },
    {
      "key": "user-api",
      "name": "User API",
      "health_endpoint": "https://user-api.internal/health/dependencies",
      "description": "User account management"
    },
    {
      "key": "notification-svc",
      "name": "Notification Service",
      "health_endpoint": "https://notifications.internal/actuator/health",
      "description": "Email and push notifications",
      "poll_interval_ms": 60000,
      "schema_config": {
        "root": "components",
        "fields": {
          "name": "$key",
          "healthy": { "field": "status", "equals": "UP" }
        }
      }
    }
  ]
}
```

Each service needs a unique `key` (lowercase alphanumeric, hyphens, underscores). This key is the stable identifier across syncs — changing it is treated as removing the old service and creating a new one.

**2. Host the manifest:**

The manifest URL can be any HTTP(S) endpoint that returns valid JSON:

- **Git raw URL** — a `manifest.json` in your repo (e.g., GitHub raw URL)
- **Internal API** — a service that dynamically generates the manifest
- **Object storage** — S3, GCS, or similar with a public or pre-signed URL
- **Static file server** — any web server serving the JSON file

The Depsera server must be able to reach this URL (10s timeout, 1MB max size, SSRF protection applies).

**3. Configure the manifest in Depsera:**

1. Navigate to your team's detail page (`/teams/:id`)
2. Click **Manifest Configuration**
3. Enter the manifest URL
4. Configure sync policies:

| Policy | Options | Description |
|--------|---------|-------------|
| **Field drift** | `flag` (default), `manifest_wins`, `local_wins` | What happens when someone edits a service locally and it differs from the manifest |
| **Service removal** | `flag` (default), `deactivate`, `delete` | What happens when a service is removed from the manifest |

5. Click **Save**

**4. Trigger the first sync:**

Click **Sync Now** on the manifest configuration page. Depsera fetches, validates, and applies the manifest. Services are created and polling begins immediately.

After the initial sync, Depsera syncs automatically every hour (configurable). You can also trigger manual syncs at any time (60s cooldown between syncs).

**5. Validate before syncing (optional):**

You can dry-run validation without triggering a sync:

```bash
curl -X POST https://depsera.example.com/api/manifest/validate \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d @manifest.json
```

This returns validation errors and warnings without creating or modifying any services.

**Adding aliases, overrides, and associations in the manifest:**

The manifest also supports `aliases`, `canonical_overrides`, and `associations` sections for declaring dependency metadata and relationships as code. See the [Manifest Schema Reference](manifest-schema.md) for the full specification and examples.

---

## Step 4: Build Your Dependency Graph

Once services are registered and polling, Depsera automatically discovers their dependencies from health check responses. The dependency graph (`/graph`) shows all services and their dependencies in an interactive visualization.

By default, dependencies that aren't associated with a registered service appear as **external nodes** in the graph. To connect the graph — showing that Service A's "PostgreSQL" dependency is actually the same PostgreSQL instance that Service B also depends on — you create **associations**.

**Creating associations from the service detail page:**

1. Navigate to `/services` and open the service that reports the dependency you want to link
2. In the dependency list, click the **Edit** button on the dependency row (e.g., "PostgreSQL")
3. In the edit modal, scroll to the **Associations** section
4. Click **+ Add Association**
5. Select the **target service** — any registered service or external service entry, grouped by team
6. Choose the **association type** (`API Call`, `Database`, `Message Queue`, `Cache`, `Other`)
7. Click **Create Association**

Existing associations for that dependency are listed in the same section, where you can also remove them.

**Using manifests instead:**

Associations can also be declared in your manifest using the `associations` section. This is the recommended approach for teams managing many services:

```json
{
  "associations": [
    {
      "service_key": "payment-api",
      "dependency_name": "PostgreSQL",
      "linked_service_key": "data-team/postgres-db",
      "association_type": "database"
    }
  ]
}
```

The `linked_service_key` uses `team_key/service_key` format to unambiguously identify services across teams. Use the service catalog (`/catalog`) to discover keys from other teams.

**Aliases:**

If different services report the same dependency under different names (e.g., one reports "pg-main" and another reports "postgres-primary"), create aliases to map them to a canonical name. In the same dependency edit modal, use the **Alias** section to set a canonical name.

Or in your manifest:

```json
{
  "aliases": [
    { "alias": "pg-main", "canonical_name": "PostgreSQL" }
  ]
}
```

With associations and aliases in place, the dependency graph connects into a meaningful tree showing how services depend on each other and on shared infrastructure.

---

## Step 5: Set Up Alerts

Depsera can notify your team when dependency health changes. Alert configuration is per-team and takes just a few minutes.

**1. Add an alert channel:**

On your team's detail page, click **Add Channel** and choose a channel type:

- **Slack** — paste a [Slack incoming webhook URL](https://api.slack.com/messaging/webhooks). Messages are formatted with Block Kit and include deep links back to Depsera.
- **Webhook** — point to any HTTP endpoint. Supports custom headers (for auth tokens) and configurable HTTP method (POST, PUT, PATCH). The payload is a JSON object with event type, service/dependency info, old/new status, severity, and timestamp.

Click **Test** to verify the channel is working before relying on it.

**2. Configure alert rules:**

In the **Alert Rules** section on the team detail page, set:

- **Severity filter:** Critical only, Warning and above, or All status changes
- **Enable/disable toggle:** Turn alerting on or off for the entire team

Depsera includes built-in flap protection (5-minute cooldown per dependency) and per-team hourly rate limiting (default 30 alerts/hour) to prevent alert storms. These are configurable by an admin in `/admin/settings`.

---

## Next Steps

With your services registered, dependency graph connected, and alerts configured, you're operational. Here's what to explore next:

- **Dashboard** (`/`) — health distribution across your organization, services with issues, and team health summaries
- **Wallboard** (`/wallboard`) — real-time status board with health cards, ideal for wall-mounted monitors in your operations center
- **Dependency graph** (`/graph`) — interactive visualization with team filtering, search, layout controls, and isolated tree views (right-click any node)
- **Overrides** — enrich dependency metadata with contact info and impact descriptions via [canonical overrides and per-instance overrides](admin-guide.md#override-management)
- **Service catalog** (`/catalog`) — browse services and external dependencies across all teams, discover manifest keys for cross-team associations

For reference:

| Document | Description |
|----------|-------------|
| [Health Endpoint Spec](health-endpoint-spec.md) | Full proactive-deps format reference, custom schema mapping details, testing, and troubleshooting |
| [Manifest Schema Reference](manifest-schema.md) | Complete manifest JSON schema, validation rules, sync policies, and example manifests |
| [Admin Guide](admin-guide.md) | User/team management, alert configuration, admin settings, data retention, and troubleshooting |
| [API Reference](api-reference.md) | All REST endpoints with request/response schemas and curl examples |
