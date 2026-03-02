# 16 — OTEL Ingestion Feasibility Study

> **Status:** Investigation complete
> **Linear:** DPS-44
> **Date:** 2026-03-01
> **Scope:** Feasibility analysis only — no code changes

---

## Table of Contents

1. [Context](#1-context)
2. [OTEL Metrics Overview](#2-otel-metrics-overview)
3. [Prometheus / OpenMetrics Parsing Feasibility](#3-prometheus--openmetrics-parsing-feasibility)
4. [OTLP/HTTP JSON Parsing Feasibility](#4-otlphttp-json-parsing-feasibility)
5. [Suggested OTEL Schemas](#5-suggested-otel-schemas)
6. [Loose Object Handling](#6-loose-object-handling)
7. [Integration with Existing Schema Mapping](#7-integration-with-existing-schema-mapping)
8. [Summary and Recommendation](#8-summary-and-recommendation)

---

## 1. Context

Depsera currently supports two input formats for polling service health endpoints:

- **Default** — the `proactive-deps` JSON array format
- **Custom schema** — arbitrary JSON with field mappings via `SchemaMapping` / `SchemaMapper`

Many services already expose health metrics via OpenTelemetry-compatible endpoints (Prometheus `/metrics`, OTLP/HTTP). Adding OTEL as a consumable input format would let teams onboard services without building a custom health endpoint — they could point Depsera at their existing OTEL metrics endpoint instead.

### Current Architecture

```
HealthPollingService (5s tick loop)
  -> ServicePoller.poll()
    -> fetchHealthEndpoint()  (HTTP GET, Accept: application/json)
    -> DependencyParser.parse(data, schemaConfig?)
      -> if schemaConfig: SchemaMapper.parse()   // custom JSON field mapping
      -> else: parse default proactive-deps array
    -> DependencyUpsertService.upsert(service, deps)
```

The target internal model is `ProactiveDepsStatus`:

```typescript
interface ProactiveDepsStatus {
  name: string;
  description?: string;
  impact?: string;
  type?: DependencyType;
  healthy: boolean;
  health: {
    state: HealthState;   // 0 | 1 | 2
    code: number;
    latency: number;      // milliseconds
    skipped?: boolean;
  };
  lastChecked: string;
  checkDetails?: Record<string, unknown>;
  contact?: Record<string, unknown>;
  error?: unknown;
  errorMessage?: string;
}
```

### Scope

- **In scope:** Prometheus text format, OTLP/HTTP JSON, metrics signal only
- **Out of scope:** Implementation (code changes, migrations, UI), Depsera *exposing* OTEL data, OTEL tracing/logging signals, gRPC/protobuf OTLP transport

---

## 2. OTEL Metrics Overview

### 2.1 Relevant Metric Types

| Metric Type | Use Case for Health Monitoring | Example |
|---|---|---|
| **Gauge** | Current health status, latency snapshot | `dependency.health.status` = 0/1/2 |
| **Counter** | Failure counts, check execution totals | `dependency.check.error_count` |
| **Histogram** | Latency distributions over time | `dependency.check.duration` buckets |
| **UpDownCounter** | Active checks, healthy dependency count | Fluctuating quantities |

**Gauge is the primary instrument** for Depsera's use case. Each dependency check produces a point-in-time status value — exactly what gauges represent. Both synchronous and asynchronous (ObservableGauge) variants work.

### 2.2 Attributes vs Resource Attributes

| Aspect | Metric Attributes | Resource Attributes |
|---|---|---|
| Scope | Per data point | Per SDK/provider instance |
| Mutability | Different per measurement | Immutable after init |
| Cardinality impact | Each unique combo = new series | Sent once per batch |
| Content | What was measured | Who is measuring |
| Limit | Default 128 per data point | No limit |

**For Depsera:**
- **Resource attributes:** `service.name`, `service.namespace`, `service.version`, `deployment.environment.name`
- **Metric attributes:** `dependency.name`, `dependency.type`, `dependency.impact`, `dependency.description`, `dependency.error_message`

### 2.3 Naming Conventions

OTEL uses dot-separated lowercase namespaces: `dependency.health.status`, `dependency.health.latency`. Units go in metadata, not names. Durations should be in seconds per OTEL convention, though Depsera's internal model uses milliseconds.

### 2.4 No Standard Health Check Convention Exists

**There is no established OTEL semantic convention for health check metrics.** The closest precedents are:

- **Prometheus `up` metric** — binary 0/1, target-level only
- **OTEL Collector `httpcheck.*` metrics** — HTTP-specific probing
- **.NET `aspnetcore.healthcheck` gauge** — community library, pre-release

None covers multi-type dependency health monitoring with degraded states. **Depsera has full freedom to define its own metric namespace** following OTEL naming conventions.

### 2.5 What Works Well / What's Awkward

**Well-suited:** Numeric health signals (status codes, latency, boolean health state), attribute-based dependency identification, stable naming namespace.

**Awkward/Missing:**
- No structured/complex attribute values — rich objects (`checkDetails`, `contact`) cannot be natively attached to metrics
- No first-class "dependency" concept — modeled via attributes
- Static metadata (contacts, SLAs, docs links) has no home in metrics — metrics are for numeric time-series only

---

## 3. Prometheus / OpenMetrics Parsing Feasibility

### 3.1 Format Overview

The Prometheus text exposition format is line-oriented and human-readable:

```
# HELP dependency_health_status Health state (0=healthy, 1=degraded, 2=unhealthy)
# TYPE dependency_health_status gauge
dependency_health_status{dependency_name="PostgreSQL",dependency_type="database"} 0
dependency_health_status{dependency_name="Redis",dependency_type="cache"} 1
dependency_health_status{dependency_name="Payment Gateway",dependency_type="rest"} 2

# HELP dependency_health_latency_milliseconds Check latency in milliseconds
# TYPE dependency_health_latency_milliseconds gauge
dependency_health_latency_milliseconds{dependency_name="PostgreSQL"} 12
dependency_health_latency_milliseconds{dependency_name="Redis"} 230
dependency_health_latency_milliseconds{dependency_name="Payment Gateway"} 0
```

Content types: `text/plain; version=0.0.4` (classic) and `application/openmetrics-text` (OpenMetrics). OpenMetrics adds `# EOF` requirement and float-second timestamps but is otherwise backward-compatible.

### 3.2 Node.js Parsing Libraries

| Library | Parses Prom Text? | Maintained? | TypeScript? | Recommended? |
|---|---|---|---|---|
| `parse-prometheus-text-format` | Yes | No (7yr old) | No | No |
| `prom-client` | No (exporter only) | Yes | Yes | N/A |
| `metrics-object-parser` | Yes | No | Unknown | No |

**No well-maintained parser exists on npm.** The only viable library (`parse-prometheus-text-format`, ~12K weekly downloads) is unmaintained for 7 years, has no TypeScript types, and returns values as strings.

### 3.3 Recommendation: Custom Parser (~150-200 lines TypeScript)

The format is a Regular Chomsky Grammar — line-oriented and regex-parseable. A custom parser provides:
- Type-safe output
- Filter-during-parse (skip irrelevant metrics by prefix before parsing labels)
- Both Prometheus and OpenMetrics content-type support
- No external dependency risk

### 3.4 Mapping to ProactiveDepsStatus

| ProactiveDepsStatus Field | Prometheus Source | Notes |
|---|---|---|
| `name` | `dependency_name` label | **Required** — join key across metrics |
| `healthy` | `dependency_health_healthy` gauge (1/0) | Direct boolean mapping |
| `health.state` | `dependency_health_status` gauge (0/1/2) | Direct integer mapping |
| `health.latency` | `dependency_health_latency_milliseconds` gauge | Direct (already ms) |
| `health.code` | `dependency_health_code` gauge | Optional, default 200/500 |
| `health.skipped` | `dependency_health_check_skipped` gauge (1/0) | Optional |
| `description` | `dependency_description` label | Embedded in health gauge labels |
| `impact` | `dependency_impact` label | Embedded in health gauge labels |
| `type` | `dependency_type` label | Embedded in health gauge labels |
| `errorMessage` | `dependency_error_message` label | Embedded in error gauge labels |
| `lastChecked` | Metric timestamp or current time | Prometheus timestamps are ms since epoch |
| `checkDetails` | **Cannot be represented** | Arbitrary nested JSON — no Prometheus equivalent |
| `contact` | **Cannot be represented** | Same limitation |
| `error` | **Cannot be represented** | Same limitation |

### 3.5 Filtering Strategy

**Metric name prefix filtering during parse** (default prefix: `dependency_`). Skip any metric line whose name doesn't start with the prefix — avoids allocating objects for the hundreds of unrelated metrics a typical endpoint exposes.

### 3.6 Implementation Estimate

- Custom parser: ~150-200 lines
- Mapper (Prom metrics -> ProactiveDepsStatus): ~100-150 lines
- ServicePoller integration: ~50-100 lines
- Tests: ~200-300 lines
- **Total: ~500-750 lines**

---

## 4. OTLP/HTTP JSON Parsing Feasibility

### 4.1 OTLP JSON Structure

The `ExportMetricsServiceRequest` payload nests 5-6 levels deep:

```
ExportMetricsServiceRequest
  └─ resourceMetrics[]
       ├─ resource.attributes[]       (KeyValue: service.name, etc.)
       └─ scopeMetrics[]
            └─ metrics[]
                 ├─ name, description, unit
                 └─ gauge.dataPoints[]
                      ├─ attributes[]  (KeyValue: dependency.name, etc.)
                      ├─ asInt / asDouble
                      └─ timeUnixNano
```

Attribute values use a tagged union: `{ stringValue: "..." }`, `{ intValue: "42" }`, `{ doubleValue: 3.14 }`, `{ boolValue: true }`. Integer values are string-encoded (proto3 JSON convention for int64).

### 4.2 Critical Finding: OTLP Is Push-Based

**Services do NOT expose a pollable OTLP endpoint.** OTLP is designed for services to `POST` data to a receiver, not for consumers to `GET` it.

**Implication:** Depsera cannot poll OTLP endpoints the way it polls health endpoints today. Supporting OTLP means either:

1. **Depsera acts as a lightweight OTLP receiver** — exposes `POST /v1/metrics` accepting pushed `ExportMetricsServiceRequest` payloads
2. **Prometheus scraping remains the pull-based OTEL path** — services expose `/metrics`, Depsera polls it

The recommended pattern is a **hybrid model**: keep existing pull-based polling for all formats (including Prometheus) and add an OTLP push receiver as a separate ingestion path. Both converge at `DependencyUpsertService`.

### 4.3 Library Assessment

| Package | Purpose | Useful for Parsing? |
|---|---|---|
| `@opentelemetry/otlp-transformer` (3M downloads) | Export-only serialization | **No** — no `deserializeRequest()` |
| `@opentelemetry/sdk-metrics` | SDK internal types | **No** — types differ from OTLP wire format |
| `@opentelemetry/exporter-metrics-otlp-http` | Export to OTLP endpoint | **No** — sends data out |

**No Node.js library exists for parsing incoming OTLP JSON.** The OTEL Collector (which does this) is written in Go.

### 4.4 Recommendation: Manual Parsing (~200 lines TypeScript)

Since OTLP/HTTP JSON is just regular JSON, `JSON.parse()` handles the format natively. The parser is ~200 lines:
- Type definitions: ~80 lines
- Attribute extraction helper: ~20 lines
- Data point to ProactiveDepsStatus mapper: ~80 lines
- Top-level request walker: ~30 lines

### 4.5 Mapping to ProactiveDepsStatus

```json
{
  "resourceMetrics": [{
    "resource": {
      "attributes": [
        { "key": "service.name", "value": { "stringValue": "order-service" } }
      ]
    },
    "scopeMetrics": [{
      "scope": { "name": "dependency-health", "version": "1.0.0" },
      "metrics": [
        {
          "name": "dependency.health.status",
          "gauge": {
            "dataPoints": [{
              "asInt": "0",
              "timeUnixNano": "1740825600000000000",
              "attributes": [
                { "key": "dependency.name", "value": { "stringValue": "PostgreSQL" } },
                { "key": "dependency.type", "value": { "stringValue": "database" } },
                { "key": "dependency.healthy", "value": { "boolValue": true } }
              ]
            }]
          }
        }
      ]
    }]
  }]
}
```

| OTLP Location | Maps to |
|---|---|
| `resource.attributes["service.name"]` | Service identification (match to registered service) |
| `dataPoint.attributes["dependency.name"]` | `name` |
| `dataPoint.attributes["dependency.type"]` | `type` |
| `metric "dependency.health.status" → asInt` | `health.state` |
| `metric "dependency.health.latency" → asDouble` | `health.latency` |
| `metric "dependency.health.code" → asInt` | `health.code` |
| `metric "dependency.health.healthy" → asInt` | `healthy` (1=true, 0=false) |
| `dataPoint.timeUnixNano` | `lastChecked` (convert nanos to ISO string) |
| `dataPoint.attributes["dependency.error_message"]` | `errorMessage` |

Same three fields cannot be carried: `checkDetails`, `contact`, `error`.

### 4.6 Complexity Comparison

| Dimension | OTLP/HTTP JSON | Prometheus Text |
|---|---|---|
| Parser needed | `JSON.parse()` (built-in) | Custom text parser |
| Structured metadata | Rich (resource attrs, scope, typed values) | Minimal (`# HELP` only) |
| Ecosystem prevalence | Growing but less common | Dominant in cloud-native |
| Implementation effort | ~200 lines | ~150 lines |
| Parsing ease | Easier (standard JSON) | Simpler conceptually |

---

## 5. Suggested OTEL Schemas

### 5.1 Design Decision: Label-Based Approach

**Single stable metric names with `dependency.name` as a label selector.** This follows OTEL and Prometheus best practices, prevents metric name explosion, and makes consumer logic straightforward.

Rejected alternative: metric-per-dependency (e.g., `postgres.health.status`) — violates OTEL naming conventions, causes metric name explosion, and complicates discovery.

### 5.2 Recommended Metrics

All gauges — each dependency check produces a point-in-time value.

| Metric Name | Type | Unit | Maps to |
|---|---|---|---|
| `dependency.health.status` | int gauge | `{status}` | `health.state` (0=healthy, 1=degraded, 2=unhealthy) |
| `dependency.health.healthy` | int gauge | `{boolean}` | `healthy` (1=true, 0=false) |
| `dependency.health.latency` | double gauge | `ms` | `health.latency` |
| `dependency.health.code` | int gauge | `{code}` | `health.code` |
| `dependency.health.check_skipped` | int gauge | `{boolean}` | `health.skipped` (1=true, 0=false) |

Both `status` (0/1/2) and `healthy` (0/1) are recommended because services that only know binary health can emit just `healthy`; Depsera derives `status` from it.

### 5.3 Attributes

**Required data-point attribute:**
- `dependency.name` — primary key for dependency identification

**Optional data-point attributes:**
- `dependency.type` — `database`, `rest`, `cache`, `message_queue`, etc.
- `dependency.impact` — `critical`, `degraded`, `minor`, or free-text
- `dependency.description` — human-readable description
- `dependency.error_message` — error message (on unhealthy data points)

**Required resource attribute:**
- `service.name` — identifies the reporting service

**Optional resource attributes:**
- `service.namespace`, `service.instance.id`, `service.version`

### 5.4 Minimum Viable Payload

A service only needs to emit `dependency.health.status` (or `dependency.health.healthy`) with a `dependency.name` attribute. All other metrics and attributes are optional with sensible defaults. This matches the existing minimal JSON format (`{ "name": "...", "healthy": true }`).

### 5.5 Full Prometheus Example

```prometheus
# HELP dependency_health_status Health state (0=healthy, 1=degraded, 2=unhealthy)
# TYPE dependency_health_status gauge
dependency_health_status{dependency_name="PostgreSQL",dependency_type="database",dependency_impact="critical",dependency_description="Primary transactional database"} 0
dependency_health_status{dependency_name="Redis",dependency_type="cache",dependency_impact="degraded",dependency_description="Session and rate-limit cache"} 1
dependency_health_status{dependency_name="Payment Gateway",dependency_type="rest",dependency_impact="critical",dependency_description="Stripe payment processing",dependency_error_message="Connection timeout after 5000ms"} 2

# HELP dependency_health_healthy Whether the dependency is healthy (1=healthy, 0=unhealthy)
# TYPE dependency_health_healthy gauge
dependency_health_healthy{dependency_name="PostgreSQL"} 1
dependency_health_healthy{dependency_name="Redis"} 0
dependency_health_healthy{dependency_name="Payment Gateway"} 0

# HELP dependency_health_latency_milliseconds Check latency in milliseconds
# TYPE dependency_health_latency_milliseconds gauge
dependency_health_latency_milliseconds{dependency_name="PostgreSQL"} 12
dependency_health_latency_milliseconds{dependency_name="Redis"} 230
dependency_health_latency_milliseconds{dependency_name="Payment Gateway"} 0

# HELP dependency_health_code HTTP-like status code from the health check
# TYPE dependency_health_code gauge
dependency_health_code{dependency_name="PostgreSQL"} 200
dependency_health_code{dependency_name="Redis"} 200
dependency_health_code{dependency_name="Payment Gateway"} 503
```

Note: Prometheus uses underscores (OTEL-to-Prometheus translation: `dependency.health.status` -> `dependency_health_status`).

### 5.6 Full OTLP/HTTP JSON Example

```json
{
  "resourceMetrics": [
    {
      "resource": {
        "attributes": [
          { "key": "service.name", "value": { "stringValue": "payment-api" } },
          { "key": "service.namespace", "value": { "stringValue": "platform" } }
        ]
      },
      "scopeMetrics": [
        {
          "scope": { "name": "dependency-health", "version": "1.0.0" },
          "metrics": [
            {
              "name": "dependency.health.status",
              "description": "Health state (0=healthy, 1=degraded, 2=unhealthy)",
              "unit": "{status}",
              "gauge": {
                "dataPoints": [
                  {
                    "asInt": "0",
                    "timeUnixNano": "1740825600000000000",
                    "attributes": [
                      { "key": "dependency.name", "value": { "stringValue": "PostgreSQL" } },
                      { "key": "dependency.type", "value": { "stringValue": "database" } },
                      { "key": "dependency.impact", "value": { "stringValue": "critical" } },
                      { "key": "dependency.description", "value": { "stringValue": "Primary transactional database" } }
                    ]
                  },
                  {
                    "asInt": "1",
                    "timeUnixNano": "1740825600000000000",
                    "attributes": [
                      { "key": "dependency.name", "value": { "stringValue": "Redis" } },
                      { "key": "dependency.type", "value": { "stringValue": "cache" } },
                      { "key": "dependency.impact", "value": { "stringValue": "degraded" } }
                    ]
                  },
                  {
                    "asInt": "2",
                    "timeUnixNano": "1740825600000000000",
                    "attributes": [
                      { "key": "dependency.name", "value": { "stringValue": "Payment Gateway" } },
                      { "key": "dependency.type", "value": { "stringValue": "rest" } },
                      { "key": "dependency.impact", "value": { "stringValue": "critical" } },
                      { "key": "dependency.error_message", "value": { "stringValue": "Connection timeout after 5000ms" } }
                    ]
                  }
                ]
              }
            },
            {
              "name": "dependency.health.healthy",
              "unit": "{boolean}",
              "gauge": {
                "dataPoints": [
                  { "asInt": "1", "timeUnixNano": "1740825600000000000", "attributes": [{ "key": "dependency.name", "value": { "stringValue": "PostgreSQL" } }] },
                  { "asInt": "0", "timeUnixNano": "1740825600000000000", "attributes": [{ "key": "dependency.name", "value": { "stringValue": "Redis" } }] },
                  { "asInt": "0", "timeUnixNano": "1740825600000000000", "attributes": [{ "key": "dependency.name", "value": { "stringValue": "Payment Gateway" } }] }
                ]
              }
            },
            {
              "name": "dependency.health.latency",
              "unit": "ms",
              "gauge": {
                "dataPoints": [
                  { "asDouble": 12.0, "timeUnixNano": "1740825600000000000", "attributes": [{ "key": "dependency.name", "value": { "stringValue": "PostgreSQL" } }] },
                  { "asDouble": 230.0, "timeUnixNano": "1740825600000000000", "attributes": [{ "key": "dependency.name", "value": { "stringValue": "Redis" } }] },
                  { "asDouble": 0.0, "timeUnixNano": "1740825600000000000", "attributes": [{ "key": "dependency.name", "value": { "stringValue": "Payment Gateway" } }] }
                ]
              }
            },
            {
              "name": "dependency.health.code",
              "unit": "{code}",
              "gauge": {
                "dataPoints": [
                  { "asInt": "200", "timeUnixNano": "1740825600000000000", "attributes": [{ "key": "dependency.name", "value": { "stringValue": "PostgreSQL" } }] },
                  { "asInt": "200", "timeUnixNano": "1740825600000000000", "attributes": [{ "key": "dependency.name", "value": { "stringValue": "Redis" } }] },
                  { "asInt": "503", "timeUnixNano": "1740825600000000000", "attributes": [{ "key": "dependency.name", "value": { "stringValue": "Payment Gateway" } }] }
                ]
              }
            }
          ]
        }
      ]
    }
  ]
}
```

### 5.7 Coverage Analysis

| Field | Representable? | Notes |
|---|---|---|
| `name` | YES | `dependency.name` attribute |
| `description` | YES | `dependency.description` attribute |
| `impact` | YES | `dependency.impact` attribute |
| `type` | YES | `dependency.type` attribute |
| `healthy` | YES | `dependency.health.healthy` gauge |
| `health.state` | YES | `dependency.health.status` gauge |
| `health.code` | YES | `dependency.health.code` gauge |
| `health.latency` | YES | `dependency.health.latency` gauge |
| `health.skipped` | YES | `dependency.health.check_skipped` gauge |
| `lastChecked` | YES | `timeUnixNano` on data point |
| `errorMessage` | YES | `dependency.error_message` attribute |
| `checkDetails` | **NO** | Arbitrary nested JSON — no OTEL equivalent |
| `contact` | **NO** | Arbitrary nested JSON — no OTEL equivalent |
| `error` | **NO** | Arbitrary type — no OTEL equivalent |

**10 of 13 fields fully representable.** The 3 gaps are all arbitrary nested JSON objects.

---

## 6. Loose Object Handling

### 6.1 The Problem

`checkDetails` and `contact` are `Record<string, unknown>` — arbitrarily nested JSON objects. OTEL's metric attribute model is flat key-value pairs with primitive types. Three approaches were evaluated.

### 6.2 Approaches Evaluated

| Criteria | Flattened Dot-Notation Attrs | JSON String Attrs | Separate Metadata (Existing Infra) |
|---|---|---|---|
| Lossless? | No (arrays, nulls, empty objects lost) | Yes | Yes (via original source) |
| OTEL-idiomatic? | Partially | No (anti-pattern) | Yes (metrics carry only metrics) |
| Prometheus compatible? | Problematic (cardinality risk) | Problematic (opaque blob) | Yes (clean labels) |
| Query-friendly? | Partially | No | Yes (via Depsera DB) |
| Cardinality risk | High (variable keys) | High (unique JSON blobs) | None |
| Implementation complexity | Medium | Low | Low (use existing system) |
| Self-contained? | Yes | Yes | No (requires manifest config) |

### 6.3 Recommendation: Separate Metadata via Existing Infrastructure

**Keep OTEL metrics clean. Use Depsera's existing manifest and override system for metadata.**

Justification:

1. **`contact` already has a home.** The manifest system with `canonical_overrides`, the `contact_override`/`impact_override` database columns, and the manual override UI already solve metadata distribution. This is the recommended path for all Depsera services, not just OTEL ones.

2. **`checkDetails` is diagnostic, not telemetric.** It captures per-check context (DB version, connection pool sizes, replication lag) — diagnostic data about *how* a check was performed, not the health *result*. OTEL emitters report status outcomes. `checkDetails` being absent for OTEL-only services is architecturally correct.

3. **`error` degrades gracefully.** The `errorMessage` string attribute carries the human-readable summary displayed in the UI. The raw `error` object is primarily for debugging. Error history recording already handles the absent-error case via the synthetic `{"unhealthy":true}` marker.

4. **The "less self-contained" trade-off is acceptable.** For OTEL-ingested services, contact info is configured via manifests or manual overrides. This avoids cardinality explosions, opaque blob attributes, and lossy flattening.

---

## 7. Integration with Existing Schema Mapping

### 7.1 Approaches Evaluated

**Approach 1: Extend SchemaMapping/SchemaMapper** — Add OTEL as a format inside schema_config. **Rejected.** Shoehorns fundamentally different parsing paradigms into a JSON field-mapping class. SchemaMapper becomes a god class. The UI guided form only makes sense for JSON field mapping.

**Approach 2: Separate parser, dispatch unclear** — New OtelParser alongside SchemaMapper. Good separation but dispatch is ambiguous (burying format inside schema_config JSON is messy).

**Approach 3: Explicit `health_endpoint_format` column** — **Recommended.** Add `health_endpoint_format TEXT NOT NULL DEFAULT 'default'` to the services table. Values: `'default' | 'schema' | 'prometheus' | 'otlp'`. Each format gets its own isolated parser class.

### 7.2 Recommended Approach: Explicit Format Column

```sql
ALTER TABLE services ADD COLUMN health_endpoint_format TEXT NOT NULL DEFAULT 'default';
-- Optional data migration:
UPDATE services SET health_endpoint_format = 'schema' WHERE schema_config IS NOT NULL;
```

**Dispatch logic:**

```typescript
type HealthEndpointFormat = 'default' | 'schema' | 'prometheus' | 'otlp';

// DependencyParser.parse()
switch (format) {
  case 'otlp':       return new OtelParser(serviceName).parse(data);
  case 'prometheus':  return new PrometheusParser(serviceName).parse(data);
  case 'schema':      return new SchemaMapper(schemaConfig!, serviceName).parse(data);
  default:            return data.map((item, i) => this.parseItem(item, i));
}
```

**ServicePoller changes:**

```typescript
// Format-aware fetch
const format = this.service.health_endpoint_format || (this.service.schema_config ? 'schema' : 'default');
const accept = format === 'prometheus' ? 'text/plain; version=0.0.4' : 'application/json';
const data = format === 'prometheus' ? await response.text() : await response.json();
```

### 7.3 Why This Approach Wins

| Criterion | Benefit |
|---|---|
| **Explicit over implicit** | Format is first-class, queryable, unambiguous |
| **Clean separation** | Each parser is isolated and independently testable |
| **Minimal disruption** | SchemaMapper untouched. DependencyParser adds one switch. |
| **Safe migration** | Additive column with default value — fully backward compatible |
| **UI extensible** | Format selector dropdown → format-specific sub-editors |
| **Backwards compatible** | `getFormat()` fallback checks schema_config for existing services |

### 7.4 test-schema Endpoint

Adapts to accept a `format` parameter alongside `url` and `schema_config`. For Prometheus/OTLP formats, `schema_config` may be null. Validation is format-specific.

### 7.5 SchemaConfigEditor UI

Refactored from binary "default vs custom" toggle to a multi-format selector:

- **proactive-deps (default)** — no config needed
- **Custom schema** — existing guided form (unchanged)
- **Prometheus** — metric name prefix, label-to-field mappings
- **OTLP** — metric name patterns, attribute mappings

---

## 8. Summary and Recommendation

### 8.1 Feasibility Assessment

**OTEL ingestion is feasible and worthwhile.** The OTEL metrics model maps cleanly to 10 of 13 `ProactiveDepsStatus` fields. The 3 gaps (`checkDetails`, `contact`, `error`) are metadata fields already handled by Depsera's manifest/override infrastructure. No blocking technical challenges were identified.

### 8.2 Key Architectural Decisions

| Decision | Recommendation | Rationale |
|---|---|---|
| OTLP transport model | **Hybrid: pull (Prometheus) + push (OTLP receiver)** | OTLP is push-based; Prometheus is pull-based. Both converge at DependencyUpsertService. |
| Parsing approach | **Custom parsers (~200 lines each)** | No maintained libraries exist for either format. Manual parsing is straightforward. |
| Metric schema design | **Label-based: single metric names with `dependency.name` selector** | Follows OTEL conventions, prevents metric explosion. |
| Metadata handling | **Separate: use existing manifest/override system** | Keeps OTEL metrics clean. No cardinality risk. |
| Integration pattern | **Explicit `health_endpoint_format` column** | Clean dispatch, independent parsers, backward compatible. |

### 8.3 Estimated Complexity: **Medium**

| Component | Effort | Lines (est.) |
|---|---|---|
| DB migration (add format column) | Small | ~30 |
| Type definitions (OTLP JSON types, HealthEndpointFormat) | Small | ~100 |
| OtelParser (OTLP JSON -> ProactiveDepsStatus) | Medium | ~200 |
| PrometheusParser (text -> ProactiveDepsStatus) | Medium | ~200 |
| DependencyParser dispatch refactor | Small | ~30 |
| ServicePoller format-aware fetch | Small | ~50 |
| OTLP receiver endpoint (POST /v1/metrics) | Medium | ~150 |
| test-schema endpoint format support | Small | ~80 |
| UI: format selector + format-specific editors | Medium | ~300 |
| Tests | Medium | ~500 |
| Documentation | Small | ~100 |
| **Total** | | **~1,750 lines** |

### 8.4 Suggested Follow-Up Implementation Stories

Ordered by dependency and priority:

| # | Story | Size | Priority | Depends On |
|---|---|---|---|---|
| 1 | **Add `health_endpoint_format` column + types** | S | MVP | — |
| | Migration, HealthEndpointFormat type, update Service type and validation | | | |
| 2 | **Implement OTLP JSON parser** | M | MVP | #1 |
| | OtelParser class, OTLP type definitions, unit tests | | | |
| 3 | **Implement Prometheus text parser** | M | MVP | #1 |
| | PrometheusParser class, OpenMetrics support, prefix filtering, unit tests | | | |
| 4 | **Refactor DependencyParser dispatch + ServicePoller** | S | MVP | #1 |
| | Format-based switch in parse(), format-aware Accept header and response handling | | | |
| 5 | **Add OTLP push receiver endpoint** | M | MVP | #2 |
| | POST /v1/metrics Express route, service identification via resource attributes, auth, rate limiting | | | |
| 6 | **Update test-schema endpoint for new formats** | S | MVP | #2, #3 |
| | Accept format param, format-specific validation, Prometheus text fetch support | | | |
| 7 | **UI: Format selector + Prometheus/OTLP config editors** | M | MVP | #1 |
| | Refactor SchemaConfigEditor into format-aware component, format-specific sub-panels | | | |
| 8 | **Integration tests + E2E test scenarios** | M | Polish | #4, #5, #6 |
| | Full polling loop with Prometheus endpoint, OTLP push scenarios, mixed-format team | | | |
| 9 | **Documentation: OTEL onboarding guide** | S | Polish | #7 |
| | User-facing docs on how to configure OTEL ingestion, metric schema reference, examples | | | |

**MVP stories: #1-#7** (core functionality). **Polish: #8-#9** (test coverage, docs).

### 8.5 Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Low adoption (services don't expose OTEL health metrics) | Prometheus format provides easier on-ramp; OTLP push adds flexibility. Both are additive — no regression risk. |
| OTLP push receiver auth/security | Require API key or session auth on the receiver endpoint. SSRF not a concern (Depsera receives, doesn't fetch). |
| Metric filtering complexity for noisy endpoints | Prefix-based filtering during parse (configurable per service). Skip early, allocate nothing. |
| OTLP schema evolution | OTLP v1 has been stable since 2023. Pin to v1 endpoint path. |

---

## References

- [OpenTelemetry Metrics Data Model](https://opentelemetry.io/docs/specs/otel/metrics/data-model/)
- [OpenTelemetry Metrics API](https://opentelemetry.io/docs/specs/otel/metrics/api/)
- [OTEL Semantic Conventions — Metrics](https://opentelemetry.io/docs/specs/semconv/general/metrics/)
- [OTEL Naming Conventions](https://opentelemetry.io/docs/specs/semconv/general/naming/)
- [OTLP Specification 1.9.0](https://opentelemetry.io/docs/specs/otlp/)
- [opentelemetry-proto examples](https://github.com/open-telemetry/opentelemetry-proto/blob/main/examples/metrics.json)
- [Prometheus Exposition Format](https://prometheus.io/docs/instrumenting/exposition_formats/)
- [Prometheus OTEL Integration Guide](https://prometheus.io/docs/guides/opentelemetry/)
- [OTEL "up" Metric Proposal (#1078)](https://github.com/open-telemetry/opentelemetry-specification/issues/1078)
- [HealthChecks.OpenTelemetry.Instrumentation](https://github.com/gowon/HealthChecks.OpenTelemetry.Instrumentation)
- [OTEP 4485 — Complex Attribute Types](https://opentelemetry.io/blog/2025/complex-attribute-types/)
