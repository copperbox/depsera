# Manifest Schema Reference

Depsera supports declarative service configuration via a JSON manifest. Each team can point to a manifest URL, and the sync engine will fetch, validate, diff, and apply the contents — creating services, aliases, canonical overrides, and associations automatically.

This document defines the full manifest JSON schema, validation rules, and provides example manifests.

## Schema Overview

A manifest is a JSON object with the following top-level structure:

```json
{
  "version": 1,
  "services": [],
  "aliases": [],
  "canonical_overrides": [],
  "associations": []
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | number | Yes | Schema version. Must be `1`. |
| `services` | array | Yes | Service definitions to sync. |
| `aliases` | array | No | Dependency alias mappings. |
| `canonical_overrides` | array | No | Contact/impact overrides by canonical name. |
| `associations` | array | No | Explicit service-to-dependency associations. |

Unknown top-level keys produce warnings but do not fail validation.

---

## Services

Each entry in the `services` array defines a monitored service.

```json
{
  "key": "payment-api",
  "name": "Payment API",
  "health_endpoint": "https://payment.example.com/health",
  "description": "Handles payment processing",
  "metrics_endpoint": "https://payment.example.com/metrics",
  "poll_interval_ms": 30000,
  "schema_config": {
    "status_path": "status",
    "healthy_value": "UP"
  }
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Unique identifier within the manifest. Lowercase alphanumeric, hyphens, and underscores. Must start with a letter or digit. Max 128 characters. Pattern: `^[a-z0-9][a-z0-9_-]*$` |
| `name` | string | Yes | Human-readable display name. |
| `health_endpoint` | string | Yes | HTTP or HTTPS URL to poll for health status. |
| `description` | string | No | Service description. |
| `metrics_endpoint` | string | No | HTTP or HTTPS URL for metrics. |
| `poll_interval_ms` | integer | No | Polling interval in milliseconds. Must be between **5,000** (5s) and **3,600,000** (1hr). Defaults to the server's configured default if omitted. |
| `schema_config` | object | No | Custom schema mapping for non-standard health endpoints. See the [Health Endpoint Spec](health-endpoint-spec.md) for details. |

### Service Key Rules

- Must match `^[a-z0-9][a-z0-9_-]*$`
- Maximum 128 characters
- Must be unique within the manifest (duplicates produce an error)
- Used to track identity across syncs — changing a key is treated as removing the old service and creating a new one

### URL Validation

Both `health_endpoint` and `metrics_endpoint` are validated as follows:

- Must be a valid HTTP or HTTPS URL (error if invalid)
- URLs targeting private or internal IP addresses produce a **warning** during validation and are **blocked** during sync (SSRF protection)
- Private addresses can be allowed via the `SSRF_ALLOWLIST` server setting

---

## Aliases

Each entry in the `aliases` array maps an alias name to a canonical dependency name. These are scoped to the team that owns the manifest.

```json
{
  "alias": "pg-main",
  "canonical_name": "PostgreSQL"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `alias` | string | Yes | The alias name to register. |
| `canonical_name` | string | Yes | The canonical dependency name this alias resolves to. |

### Rules

- No duplicate `alias` values within the manifest (error)
- Both fields must be non-empty strings

---

## Canonical Overrides

Each entry in the `canonical_overrides` array sets contact and/or impact metadata for a canonical dependency name. These are scoped to the owning team.

```json
{
  "canonical_name": "PostgreSQL",
  "contact": {
    "email": "db-team@example.com",
    "slack": "#db-support",
    "pagerduty": "https://pd.example.com/service/db"
  },
  "impact": "critical"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `canonical_name` | string | Yes | The canonical dependency name to override. |
| `contact` | object | No* | Contact information object (free-form key-value pairs). |
| `impact` | string | No* | Impact description or severity level. |

*At least one of `contact` or `impact` must be provided (error otherwise).

### Rules

- No duplicate `canonical_name` values within the manifest (error)
- `contact` must be an object (not an array or primitive) if provided
- `impact` must be a string if provided

---

## Associations

Each entry in the `associations` array declares an explicit dependency relationship between a service in the manifest and a dependency by name.

```json
{
  "service_key": "payment-api",
  "dependency_name": "PostgreSQL",
  "association_type": "database"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `service_key` | string | Yes | Must reference a `key` from the `services` array. |
| `dependency_name` | string | Yes | Canonical name of the dependency. |
| `association_type` | string | Yes | One of: `api_call`, `database`, `message_queue`, `cache`, `other`. |

### Rules

- `service_key` must match a key defined in the `services` array (error if not)
- `association_type` must be a valid enum value (error if not)
- No duplicate tuples of `(service_key, dependency_name, association_type)` (error)

---

## Validation

The sync engine validates manifests using a 3-level strategy. All sections are validated independently — a failure in one does not block validation of the others.

### Level 1: Structure

- The root must be a JSON object
- `version` must be present and equal to `1`
- `services` must be present and be an array
- Unknown top-level keys produce warnings

### Level 2: Per-Entry

Each service entry is validated individually for:
- Required fields present and correctly typed
- URL format and SSRF hostname checks
- `poll_interval_ms` bounds (5,000–3,600,000)
- `schema_config` structural validity
- Unknown fields within entries produce warnings

Optional sections (`aliases`, `canonical_overrides`, `associations`) are each validated for required fields, correct types, and section-specific constraints.

### Level 3: Cross-Reference

- Duplicate `key` values across services produce an error
- Duplicate `name` values across services produce a warning (names are not required to be unique)
- Association `service_key` values must reference a service key defined in the manifest
- Duplicate alias names, canonical override names, and association tuples produce errors

### Validation Endpoint

You can dry-run validation without triggering a sync:

```bash
curl -X POST http://localhost:3001/api/manifest/validate \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d @manifest.json
```

Response:

```json
{
  "valid": true,
  "version": 1,
  "service_count": 3,
  "valid_count": 3,
  "errors": [],
  "warnings": []
}
```

When validation fails, `errors` contains structured issues:

```json
{
  "valid": false,
  "version": 1,
  "service_count": 2,
  "valid_count": 1,
  "errors": [
    {
      "severity": "error",
      "path": "services[1].health_endpoint",
      "message": "Must be a valid HTTP or HTTPS URL"
    }
  ],
  "warnings": [
    {
      "severity": "warning",
      "path": "services[0].health_endpoint",
      "message": "URL targets a private or internal address"
    }
  ]
}
```

---

## Sync Policies

When configuring a manifest for a team, you can set policies that control how the sync engine handles conflicts and removals.

### Field Drift Policy (`on_field_drift`)

Controls what happens when a manifest value differs from the local value **and** the local value was manually edited since the last sync.

| Value | Behavior |
|-------|----------|
| `flag` (default) | Create a drift flag for review. The local value is kept until the flag is accepted or dismissed. |
| `manifest_wins` | Overwrite the local value with the manifest value automatically. |
| `local_wins` | Keep the local value. Skip the update for that field. |

### Service Removal Policy (`on_removal`)

Controls what happens when a service that was previously synced from the manifest is no longer present.

| Value | Behavior |
|-------|----------|
| `flag` (default) | Create a removal drift flag for review. The service remains active until the flag is accepted. |
| `deactivate` | Automatically deactivate the service (stops polling, hidden from active views). |
| `delete` | Permanently delete the service and its data. |

### Metadata Removal Policies

| Policy | Default | Controls |
|--------|---------|----------|
| `on_alias_removal` | `keep` | What happens when an alias is removed from the manifest. `remove` deletes it; `keep` leaves it. |
| `on_override_removal` | `keep` | What happens when a canonical override is removed. |
| `on_association_removal` | `keep` | What happens when an association is removed. |

---

## Example Manifests

### Minimal — Services Only

The simplest valid manifest with just two services:

```json
{
  "version": 1,
  "services": [
    {
      "key": "user-api",
      "name": "User API",
      "health_endpoint": "https://user-api.example.com/health"
    },
    {
      "key": "order-api",
      "name": "Order API",
      "health_endpoint": "https://order-api.example.com/health"
    }
  ]
}
```

### Full — All Sections

A complete manifest using all features:

```json
{
  "version": 1,
  "services": [
    {
      "key": "payment-api",
      "name": "Payment API",
      "health_endpoint": "https://payment.example.com/actuator/health",
      "description": "Processes payments and manages transactions",
      "metrics_endpoint": "https://payment.example.com/actuator/metrics",
      "poll_interval_ms": 15000,
      "schema_config": {
        "status_path": "status",
        "healthy_value": "UP",
        "dependencies_path": "components",
        "dependency_status_path": "status",
        "dependency_healthy_value": "UP",
        "object_keyed": true
      }
    },
    {
      "key": "notification-svc",
      "name": "Notification Service",
      "health_endpoint": "https://notifications.example.com/health",
      "description": "Sends email, SMS, and push notifications",
      "poll_interval_ms": 60000
    },
    {
      "key": "gateway",
      "name": "API Gateway",
      "health_endpoint": "https://gateway.example.com/healthz"
    }
  ],
  "aliases": [
    {
      "alias": "pg-main",
      "canonical_name": "PostgreSQL"
    },
    {
      "alias": "redis-cache",
      "canonical_name": "Redis"
    },
    {
      "alias": "rmq",
      "canonical_name": "RabbitMQ"
    }
  ],
  "canonical_overrides": [
    {
      "canonical_name": "PostgreSQL",
      "contact": {
        "email": "db-team@example.com",
        "slack": "#db-support"
      },
      "impact": "critical"
    },
    {
      "canonical_name": "Redis",
      "contact": {
        "slack": "#cache-ops"
      },
      "impact": "high"
    }
  ],
  "associations": [
    {
      "service_key": "payment-api",
      "dependency_name": "PostgreSQL",
      "association_type": "database"
    },
    {
      "service_key": "payment-api",
      "dependency_name": "RabbitMQ",
      "association_type": "message_queue"
    },
    {
      "service_key": "notification-svc",
      "dependency_name": "RabbitMQ",
      "association_type": "message_queue"
    },
    {
      "service_key": "notification-svc",
      "dependency_name": "Redis",
      "association_type": "cache"
    },
    {
      "service_key": "gateway",
      "dependency_name": "Payment API",
      "association_type": "api_call"
    }
  ]
}
```

### Spring Boot Actuator Service

A service using Spring Boot Actuator's health endpoint with custom schema mapping:

```json
{
  "version": 1,
  "services": [
    {
      "key": "inventory-svc",
      "name": "Inventory Service",
      "health_endpoint": "https://inventory.example.com/actuator/health",
      "description": "Spring Boot service managing product inventory",
      "poll_interval_ms": 30000,
      "schema_config": {
        "status_path": "status",
        "healthy_value": "UP",
        "dependencies_path": "components",
        "dependency_status_path": "status",
        "dependency_healthy_value": "UP",
        "object_keyed": true,
        "skip_checks": ["diskSpace", "ping"]
      }
    }
  ]
}
```

### Multiple Teams Sharing Dependencies

Two separate team manifests demonstrating shared canonical names and aliases:

**Team A manifest:**

```json
{
  "version": 1,
  "services": [
    {
      "key": "billing-api",
      "name": "Billing API",
      "health_endpoint": "https://billing.example.com/health"
    }
  ],
  "aliases": [
    { "alias": "billing-db", "canonical_name": "PostgreSQL" }
  ],
  "associations": [
    {
      "service_key": "billing-api",
      "dependency_name": "PostgreSQL",
      "association_type": "database"
    }
  ]
}
```

**Team B manifest:**

```json
{
  "version": 1,
  "services": [
    {
      "key": "analytics-api",
      "name": "Analytics API",
      "health_endpoint": "https://analytics.example.com/health"
    }
  ],
  "aliases": [
    { "alias": "analytics-db", "canonical_name": "PostgreSQL" }
  ],
  "associations": [
    {
      "service_key": "analytics-api",
      "dependency_name": "PostgreSQL",
      "association_type": "database"
    }
  ]
}
```

Both teams' aliases resolve to the same canonical "PostgreSQL" dependency, allowing shared visibility in the dependency graph and wallboard.

---

## Hosting Your Manifest

The manifest URL can point to any HTTP(S) endpoint that returns valid JSON. Common options:

- **Git-hosted raw file** — e.g., a `manifest.json` in your repo served via raw URL
- **Internal API** — a service that generates the manifest dynamically
- **Object storage** — S3, GCS, or similar with a public or pre-signed URL
- **Static file server** — any web server serving the JSON file

The sync engine fetches the URL with these constraints:

- **Timeout:** 10 seconds
- **Max size:** 1 MB
- **Headers sent:** `Accept: application/json`, `User-Agent: Depsera-Manifest-Sync/1.0`
- **SSRF protection:** Private/internal IP addresses are blocked unless listed in the `SSRF_ALLOWLIST` server setting
