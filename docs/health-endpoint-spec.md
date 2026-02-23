# Health Endpoint Specification

This document covers the health endpoint format that Depsera expects, and how to use custom schema mappings to integrate services that don't follow the default format.

---

## Table of Contents

- [Default Format (proactive-deps)](#default-format-proactive-deps)
  - [Response Structure](#response-structure)
  - [Field Reference](#field-reference)
  - [Health States](#health-states)
  - [Dependency Types](#dependency-types)
  - [Flat Format Alternative](#flat-format-alternative)
  - [Minimal Example](#minimal-example)
- [Custom Schema Mapping](#custom-schema-mapping)
  - [When to Use](#when-to-use)
  - [Schema Configuration](#schema-configuration)
  - [Field Mappings](#field-mappings)
  - [Boolean Comparisons](#boolean-comparisons)
  - [Dot-Notation Paths](#dot-notation-paths)
  - [Healthy Value Coercion](#healthy-value-coercion)
  - [Object-Keyed Dependencies](#object-keyed-dependencies)
- [Examples](#examples)
  - [Spring Boot Actuator](#spring-boot-actuator)
  - [ASP.NET Health Checks](#aspnet-health-checks)
  - [Custom Status Page](#custom-status-page)
  - [Nested Response with Boolean Comparison](#nested-response-with-boolean-comparison)
- [Testing Schema Mappings](#testing-schema-mappings)
  - [Using the UI](#using-the-ui)
  - [Using the API](#using-the-api)
- [Troubleshooting](#troubleshooting)

---

## Default Format (proactive-deps)

By default, Depsera expects your health endpoint to return a JSON array of dependency status objects. This is the [proactive-deps](https://github.com/your-org/proactive-deps) format.

### Response Structure

Your health endpoint should return an array at the top level:

```json
[
  {
    "name": "PostgreSQL",
    "description": "Primary database",
    "impact": "critical",
    "type": "database",
    "healthy": true,
    "health": {
      "state": 0,
      "code": 200,
      "latency": 12
    },
    "lastChecked": "2026-02-21T10:30:00.000Z"
  },
  {
    "name": "Redis Cache",
    "description": "Session store",
    "impact": "warning",
    "type": "cache",
    "healthy": true,
    "health": {
      "state": 0,
      "code": 200,
      "latency": 2
    },
    "lastChecked": "2026-02-21T10:30:00.000Z"
  }
]
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Dependency name (used for identification and alias matching) |
| `healthy` | boolean | Yes | `true` if the dependency is operational |
| `health` | object | No | Detailed health information (see below) |
| `health.state` | number | No | `0` = OK, `1` = WARNING, `2` = CRITICAL. Default: derived from `healthy` |
| `health.code` | number | No | HTTP-style status code (e.g., `200`, `500`). Default: `200` |
| `health.latency` | number | No | Response time in milliseconds. Default: `0` |
| `health.skipped` | boolean | No | Whether the check was skipped |
| `description` | string | No | Human-readable description |
| `impact` | string | No | Impact level if this dependency fails (e.g., `"critical"`, `"warning"`) |
| `type` | string | No | Dependency type (see [Dependency Types](#dependency-types)). Default: `"other"` |
| `lastChecked` | string | No | ISO-8601 timestamp of the last check. Default: current time |
| `checkDetails` | object | No | Arbitrary key-value details about the check |
| `error` | any | No | Error value if the check failed |
| `errorMessage` | string | No | Human-readable error message |

### Health States

| Value | Name | Description |
|-------|------|-------------|
| `0` | OK | Dependency is healthy |
| `1` | WARNING | Dependency is degraded but functional |
| `2` | CRITICAL | Dependency is down or non-functional |

### Dependency Types

Valid values for the `type` field:

| Type | Description |
|------|-------------|
| `database` | SQL/NoSQL databases |
| `rest` | REST API dependencies |
| `soap` | SOAP web services |
| `grpc` | gRPC services |
| `graphql` | GraphQL APIs |
| `message_queue` | Message brokers (RabbitMQ, Kafka, etc.) |
| `cache` | Caching systems (Redis, Memcached, etc.) |
| `file_system` | File storage or filesystem dependencies |
| `smtp` | Email/SMTP services |
| `other` | Any other dependency type (default) |

### Flat Format Alternative

Depsera also accepts a flat format where health data is at the top level of each item instead of nested under a `health` object:

```json
[
  {
    "name": "PostgreSQL",
    "healthy": true,
    "healthCode": 200,
    "latencyMs": 12
  }
]
```

In flat format, `health.state` is derived automatically: `0` (OK) when `healthy` is `true`, `2` (CRITICAL) when `false`.

### Minimal Example

The absolute minimum required fields:

```json
[
  { "name": "database", "healthy": true },
  { "name": "cache", "healthy": false }
]
```

---

## Custom Schema Mapping

If your service doesn't return the proactive-deps format, you can configure a **custom schema mapping** to tell Depsera how to extract dependency data from your endpoint's response.

### When to Use

Use custom schema mapping when your health endpoint:

- Returns an object with a nested array or object-keyed dependencies (instead of a top-level array)
- Uses different field names (e.g., `status` instead of `healthy`)
- Represents health as a string (e.g., `"UP"`, `"DOWN"`) instead of a boolean
- Uses a different response structure than proactive-deps

### Schema Configuration

A schema mapping has two parts: a **root path** pointing to the array or object of checks, and **field mappings** that tell Depsera where to find each piece of data.

```json
{
  "root": "path.to.dependencies",
  "fields": {
    "name": "fieldName",
    "healthy": "fieldName",
    "latency": "fieldName",
    "impact": "fieldName",
    "description": "fieldName"
  }
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `root` | string | Yes | Dot-notation path to the dependencies in the response (array or object with named keys) |
| `fields.name` | string or object | Yes | Path to the dependency name field |
| `fields.healthy` | string or object | Yes | Path to the health status field (or a [boolean comparison](#boolean-comparisons)) |
| `fields.latency` | string or object | No | Path to the latency/response time field |
| `fields.impact` | string or object | No | Path to the impact/severity field |
| `fields.description` | string or object | No | Path to the description field |
| `fields.checkDetails` | string | No | Path to an arbitrary metadata object (captured as-is) |

### Field Mappings

Each field mapping is either a **string path** or a **boolean comparison object**.

**String path** — a dot-notation path to the field value:

```json
{
  "fields": {
    "name": "checkName",
    "latency": "metrics.responseTime"
  }
}
```

**Boolean comparison** — compares a field value against an expected string (see next section):

```json
{
  "fields": {
    "healthy": { "field": "status", "equals": "UP" }
  }
}
```

### Boolean Comparisons

When a health endpoint represents status as a string (e.g., `"UP"`, `"OK"`, `"healthy"`) instead of a boolean, use a boolean comparison:

```json
{
  "field": "status",
  "equals": "UP"
}
```

This resolves to `true` when the field value matches the `equals` string (case-insensitive), and `false` otherwise.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `field` | string | Yes | Dot-notation path to the field |
| `equals` | string | Yes | Value to compare against (case-insensitive) |

**Examples:**

| Field value | Comparison | Result |
|-------------|-----------|--------|
| `"UP"` | `{ "field": "status", "equals": "UP" }` | `true` |
| `"up"` | `{ "field": "status", "equals": "UP" }` | `true` |
| `"DOWN"` | `{ "field": "status", "equals": "UP" }` | `false` |
| `"Healthy"` | `{ "field": "status", "equals": "healthy" }` | `true` |

### Dot-Notation Paths

All field paths use dot notation to traverse nested objects:

| Path | Resolves to |
|------|-------------|
| `"name"` | `item.name` |
| `"status"` | `item.status` |
| `"health.state"` | `item.health.state` |
| `"metrics.response.time"` | `item.metrics.response.time` |

If any part of the path is missing or null, the field resolves to `undefined` and is treated as missing.

### Healthy Value Coercion

When using a simple string path for the `healthy` field (without a boolean comparison), the resolved value is coerced to a boolean:

| Value type | Coercion rule |
|-----------|---------------|
| `true` / `false` | Used directly |
| `"true"`, `"ok"`, `"healthy"`, `"up"` | `true` (case-insensitive) |
| `"false"`, `"error"`, `"unhealthy"`, `"down"`, `"critical"` | `false` (case-insensitive) |
| Any other value | Skipped (dependency not parsed) |

This means if your endpoint returns `"healthy": "OK"` or `"status": "up"`, a simple string mapping works without needing a boolean comparison:

```json
{
  "fields": {
    "healthy": "status"
  }
}
```

Use a boolean comparison when your status values don't match the built-in coercion list (e.g., `"RUNNING"`, `"ACTIVE"`, `"green"`):

```json
{
  "fields": {
    "healthy": { "field": "status", "equals": "RUNNING" }
  }
}
```

### Object-Keyed Dependencies

Many health endpoints (Spring Boot Actuator, ASP.NET Health Checks) return dependencies as an **object with named keys** instead of an array:

```json
{
  "components": {
    "db": { "status": "UP" },
    "redis": { "status": "UP" },
    "diskSpace": { "status": "DOWN" }
  }
}
```

Depsera auto-detects whether the root path resolves to an array or an object. When it resolves to an object, each key is treated as a separate dependency.

To use the object key as the dependency name, set `fields.name` to the special sentinel value `"$key"`:

```json
{
  "root": "components",
  "fields": {
    "name": "$key",
    "healthy": { "field": "status", "equals": "UP" }
  }
}
```

This produces three dependencies named `"db"`, `"redis"`, and `"diskSpace"`.

**Rules:**

- `"$key"` is only valid for the `name` field. Using it for `healthy`, `latency`, `impact`, `description`, or `checkDetails` will be rejected.
- You can also use a regular field path for `name` if each object value contains a name field (e.g., `"name": "displayName"`). The object key is ignored in this case.
- Non-object values in the root object (strings, numbers, null) are silently skipped.
- An empty object produces an empty dependency list.

**In the UI:** Check the "Use object keys as dependency names" checkbox below the root path field. This hides the name field input and sets `fields.name` to `"$key"` automatically.

---

## Examples

### Spring Boot Actuator

Spring Boot Actuator's `/actuator/health` endpoint returns:

```json
{
  "status": "UP",
  "components": {
    "db": {
      "status": "UP",
      "details": {
        "database": "PostgreSQL",
        "validationQuery": "isValid()"
      }
    },
    "redis": {
      "status": "UP",
      "details": {
        "version": "7.0.0"
      }
    },
    "diskSpace": {
      "status": "UP",
      "details": {
        "total": 107374182400,
        "free": 85899345920
      }
    }
  }
}
```

**Schema mapping** — point directly at the `components` object and use `$key` for the name:

```json
{
  "root": "components",
  "fields": {
    "name": "$key",
    "healthy": { "field": "status", "equals": "UP" }
  }
}
```

This produces three dependencies: `"db"` (healthy), `"redis"` (healthy), and `"diskSpace"` (healthy). No wrapper endpoint needed.

> **Tip:** In the UI, check "Use object keys as dependency names" to set this up with the guided form.

### ASP.NET Health Checks

ASP.NET Core's health check endpoint (`/health`) with detailed output returns:

```json
{
  "status": "Healthy",
  "totalDuration": "00:00:00.0512345",
  "entries": {
    "sqlserver": {
      "status": "Healthy",
      "duration": "00:00:00.0234567",
      "description": "SQL Server connection check"
    },
    "redis": {
      "status": "Degraded",
      "duration": "00:00:00.1500000",
      "description": "Redis connectivity"
    }
  }
}
```

**Schema mapping** — point directly at the `entries` object and use `$key` for the name:

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

This produces two dependencies: `"sqlserver"` (healthy) and `"redis"` (unhealthy, since `"Degraded"` doesn't equal `"Healthy"`). No wrapper endpoint needed.

> **Note:** ASP.NET's `"Degraded"` status is mapped as unhealthy with this comparison. If you want both `"Healthy"` and `"Degraded"` to be treated as healthy, you could use a simple string mapping with `"healthy": "status"` — the value `"Healthy"` is auto-coerced to `true` (see [Healthy Value Coercion](#healthy-value-coercion)).

### Custom Status Page

A custom internal service that returns a nested status object:

```json
{
  "meta": { "version": "2.1.0", "timestamp": "2026-02-21T10:00:00Z" },
  "data": {
    "services": [
      {
        "serviceName": "Payment Gateway",
        "isActive": true,
        "metrics": { "latencyMs": 45, "errorRate": 0.01 },
        "severity": "high",
        "label": "Processes all card payments"
      },
      {
        "serviceName": "Email Provider",
        "isActive": false,
        "metrics": { "latencyMs": 0, "errorRate": 1.0 },
        "severity": "low",
        "label": "Transactional email delivery"
      }
    ]
  }
}
```

**Schema mapping:**

```json
{
  "root": "data.services",
  "fields": {
    "name": "serviceName",
    "healthy": "isActive",
    "latency": "metrics.latencyMs",
    "impact": "severity",
    "description": "label"
  }
}
```

Here, `isActive` is a boolean field, so no boolean comparison is needed — the value is used directly.

### Nested Response with Boolean Comparison

An endpoint that uses string status codes:

```json
{
  "healthReport": {
    "dependencies": [
      {
        "id": "dep-001",
        "displayName": "Auth Service",
        "state": "RUNNING",
        "response": { "time": 32 }
      },
      {
        "id": "dep-002",
        "displayName": "Storage Service",
        "state": "STOPPED",
        "response": { "time": 0 }
      }
    ]
  }
}
```

**Schema mapping:**

```json
{
  "root": "healthReport.dependencies",
  "fields": {
    "name": "displayName",
    "healthy": { "field": "state", "equals": "RUNNING" },
    "latency": "response.time"
  }
}
```

Result: `"Auth Service"` is healthy (state equals `"RUNNING"`), `"Storage Service"` is unhealthy (state does not equal `"RUNNING"`).

---

## Testing Schema Mappings

Before saving a schema mapping to a service, you can test it against a live endpoint to verify the parsed results.

### Using the UI

1. Navigate to **Services** and click **Create Service** (or edit an existing one).
2. In the **Health Endpoint Format** section, select **Custom schema**.
3. Fill in the field mappings using the guided form:
   - **Path to checks array** — the `root` path (e.g., `data.checks`)
   - **Name field** — path to the dependency name (e.g., `name`)
   - **Healthy field** — path to the health status (e.g., `status`)
   - **Healthy equals value** — (optional) for boolean comparison (e.g., `UP`)
   - **Latency field** — (optional) path to response time (e.g., `responseTimeMs`)
   - **Impact field** — (optional) path to severity (e.g., `severity`)
   - **Description field** — (optional) path to description
   - **Check details field** — (optional) path to an arbitrary metadata object (e.g., `details`)
4. Enter the health endpoint URL in the **Health Endpoint** field.
5. Click **Test mapping** to fetch the endpoint and preview parsed results.
6. Review the preview table showing each parsed dependency with its health status, latency, and impact.
7. Check the warnings list for any issues (missing fields, zero latency, empty results).

**Advanced mode:** Toggle **Advanced (JSON)** to edit the schema mapping as raw JSON. This is useful for copying mappings between services or fine-tuning complex configurations.

### Using the API

Test a schema mapping programmatically with `POST /api/services/test-schema`:

```bash
curl -X POST http://localhost:3001/api/services/test-schema \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -b cookies.txt \
  -d '{
    "url": "https://your-service.example.com/health",
    "schema_config": {
      "root": "checks",
      "fields": {
        "name": "checkName",
        "healthy": { "field": "status", "equals": "UP" },
        "latency": "responseTimeMs"
      }
    }
  }'
```

**Response:**

```json
{
  "success": true,
  "dependencies": [
    {
      "name": "database",
      "healthy": true,
      "latency_ms": 12,
      "impact": null,
      "description": null,
      "type": "other"
    }
  ],
  "warnings": [
    "No impact field mapping configured — impact data will not be captured"
  ]
}
```

**Requirements:**
- Authentication required (team lead on any team, or admin)
- The URL is SSRF-validated (private/reserved IPs are blocked unless allowlisted)
- 10-second timeout on the HTTP fetch
- Nothing is stored — this is a dry run

**Possible warnings:**
- `"No <field> field mapping configured — <field> data will not be captured"` — an optional field mapping is missing
- `"Schema mapping error: root path \"...\" did not resolve to an array or object"` — the root path doesn't point to an array or object
- `"No dependencies parsed from response"` — the mapping produced zero results

---

## Troubleshooting

### "Invalid response: expected array"

Your endpoint returns a JSON object (not an array) and no schema mapping is configured. Either:
- Change your endpoint to return a top-level JSON array, or
- Configure a custom schema mapping with a `root` path pointing to the array

### "Root path did not resolve to an array or object"

The `root` path in your schema mapping doesn't point to an array or object in the response. Verify:
- The response structure matches what you expect (use `curl` to check)
- The `root` path is correct (e.g., `data.checks`, not `data.check`)
- The path leads to an array or an object with named keys, not a string or number

### No dependencies parsed

The mapping ran but produced zero results. Common causes:
- Items in the array are missing the `name` field (or the mapped name field is empty)
- The `healthy` field couldn't be resolved or coerced to a boolean
- All items are non-object values (strings, numbers, null)

### Latency shows as 0

- Verify the `latency` field mapping points to the correct field
- Ensure the field contains a numeric value (strings like `"45ms"` won't parse)
- If your endpoint uses seconds instead of milliseconds, you may need an adapter

### Schema mapping works in test but not in polling

- Check the service's `schema_config` was saved correctly (view the service details)
- Verify the health endpoint is accessible from the server (not just your browser)
- Check server logs for SSRF blocks or network errors
- Ensure the endpoint returns consistent response structures across calls

### Boolean comparison doesn't match

- Comparison is case-insensitive (`"UP"` matches `"up"`)
- Make sure the `field` path resolves to a string value
- If the field contains a boolean (`true`/`false`), use a simple string mapping instead of a boolean comparison
