# Depsera Technical Specification — Index

> **Usage:** Read this index to identify which spec sections are relevant to your current task, then read only those files. Each section is a self-contained file.

> **Convention:** Items marked **[Implemented]** exist today. Items marked **[Planned]** are part of the 1.0 roadmap but not yet built.

## Section Map

| # | File | Topics | Keywords |
|---|---|---|---|
| 1 | [01-architecture.md](./01-architecture.md) | Monorepo layout, runtime topology, request flow, key design decisions | architecture, monorepo, Express, Vite, SQLite, topology, proxy, request flow |
| 2 | [02-data-model.md](./02-data-model.md) | Database config, all table definitions, type enums, migration history | database, schema, tables, columns, migrations, SQLite, ERD, types, enums, foreign keys |
| 3 | [03-auth.md](./03-auth.md) | OIDC flow, local auth, sessions, CSRF, RBAC, middleware | authentication, authorization, OIDC, PKCE, login, logout, session, CSRF, roles, middleware, local auth, passwords |
| 4 | [04-api-reference.md](./04-api-reference.md) | All REST API endpoints, request/response shapes, validation rules | API, endpoints, routes, REST, request, response, CRUD, services, teams, users, aliases, associations, graph, latency, errors, admin, alerts, wallboard, overrides |
| 5 | [05-health-polling.md](./05-health-polling.md) | Polling lifecycle, circuit breaker, backoff, TTL cache, host rate limiter, deduplication, dependency parsing, events | polling, health check, circuit breaker, backoff, TTL, cache, rate limiter, deduplication, dependency parsing, events, upsert |
| 6 | [06-dependency-graph.md](./06-dependency-graph.md) | Graph building, node types, edge construction, upstream traversal | graph, nodes, edges, external nodes, traversal, subgraph, React Flow |
| 7 | [07-auto-suggestion.md](./07-auto-suggestion.md) | Matching strategies, token overlap, Levenshtein, association type inference | suggestions, matching, confidence, Levenshtein, token overlap, association type |
| 8 | [08-ssrf.md](./08-ssrf.md) | Blocked IP ranges, two-step validation, allowlist | SSRF, security, IP ranges, DNS rebinding, allowlist, private networks |
| 9 | [09-security.md](./09-security.md) | Security headers, HTTPS redirect, rate limiting, redirect validation, middleware order | security, headers, Helmet, CSP, HTTPS, rate limiting, middleware order |
| 10 | [10-client-architecture.md](./10-client-architecture.md) | Routing, context providers, API client pattern, custom hooks, localStorage keys | client, React, routing, AuthContext, ThemeContext, hooks, localStorage, API client |
| 11 | [11-configuration.md](./11-configuration.md) | All environment variables reference | configuration, env vars, environment variables, PORT, DATABASE_PATH, OIDC, SESSION_SECRET, TRUST_PROXY |
| 12 | [12-planned-features.md](./12-planned-features.md) | Security hardening, team-scoped access, admin settings, data retention, custom schema, alerting, charts, local auth, deployment, Docker | planned, roadmap, 1.0, security hardening, team-scoped, admin settings, retention, schema mapping, alerts, charts, Docker, deployment |
| 13 | [13-store-layer.md](./13-store-layer.md) | StoreRegistry, all store interfaces and method signatures | stores, StoreRegistry, interfaces, IServiceStore, ITeamStore, IUserStore, IDependencyStore, IAssociationStore |
| 14 | [14-isolated-tree-view.md](./14-isolated-tree-view.md) | Isolated dependency tree view, graph isolation, context menu, deep linking | graph, isolation, isolate, tree view, context menu, deep linking, filter |
| 15 | [15-manifest-sync.md](./15-manifest-sync.md) | ManifestSyncService orchestrator, sync pipeline, drift detection, scheduling, concurrency, shutdown | manifest, sync, drift, ManifestSyncService, scheduling, concurrency, polling integration, audit |

## Cross-Reference Guide

When working on a task, use these mappings to find the right sections:

- **Adding/modifying an API endpoint** → 04 (API Reference) + 02 (Data Model) + 13 (Store Layer)
- **Database/migration changes** → 02 (Data Model) + 13 (Store Layer)
- **Auth or permissions changes** → 03 (Auth) + 09 (Security)
- **Polling or health check changes** → 05 (Health Polling) + 08 (SSRF)
- **Graph visualization changes** → 06 (Dependency Graph) + 14 (Isolated Tree View) + 10 (Client Architecture)
- **Alert system changes** → 12 (Planned Features §12.6) + 04 (API Reference §4.11)
- **Frontend component changes** → 10 (Client Architecture) + 04 (API Reference)
- **Configuration/env var changes** → 11 (Configuration)
- **Schema mapping / custom health endpoints** → 12 (Planned Features §12.5) + 05 (Health Polling)
- **Manifest sync / drift detection** → 15 (Manifest Sync) + 13 (Store Layer) + 08 (SSRF) + [Manifest Schema Reference](../manifest-schema.md)
- **Deployment / Docker** → 12 (Planned Features §12.9) + 11 (Configuration)
