# 11. Configuration Reference

**[Implemented]**

All configuration is via environment variables on the server (set in `server/.env`).

## 11.1 Core

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Server listen port |
| `DATABASE_PATH` | `./data/database.sqlite` | SQLite database file path |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin (client URL) |
| `NODE_ENV` | — | `production` enables strict validation |

## 11.2 Authentication

| Variable | Default | Description |
|---|---|---|
| `OIDC_ISSUER_URL` | — | OIDC provider discovery URL |
| `OIDC_CLIENT_ID` | — | OAuth2 client ID |
| `OIDC_CLIENT_SECRET` | — | OAuth2 client secret |
| `OIDC_REDIRECT_URI` | `http://localhost:3001/api/auth/callback` | OAuth2 callback URL |
| `SESSION_SECRET` | weak default in dev | Session signing secret (≥32 chars required in production) |
| ~~`AUTH_BYPASS`~~ | — | **Removed.** Use `LOCAL_AUTH=true` for development instead. |

## 11.3 Security

| Variable | Default | Description |
|---|---|---|
| `TRUST_PROXY` | — | Express trust proxy setting. Accepts: `true`, hop count, IP/subnet, `loopback`, comma-separated list. |
| `REQUIRE_HTTPS` | `false` | `'true'` enables 301 HTTP → HTTPS redirect |
| `SSRF_ALLOWLIST` | — | Comma-separated hostnames, wildcards (`*.internal`), CIDRs (`10.0.0.0/8`) |

## 11.4 Rate Limiting

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | Global rate limit window |
| `RATE_LIMIT_MAX` | `100` | Max requests per IP per global window |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `60000` (1 min) | Auth endpoint rate limit window |
| `AUTH_RATE_LIMIT_MAX` | `10` | Max auth requests per IP per window |

## 11.5 Polling

| Variable | Default | Description |
|---|---|---|
| `POLL_MAX_CONCURRENT_PER_HOST` | `3` | Max concurrent polls per target hostname |

## 11.6 Alerting

| Variable | Default | Description |
|---|---|---|
| `APP_BASE_URL` | — | Base URL for deep links in alert messages (e.g., `https://depsera.internal.com`) |

## 11.7 Logging

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | Log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |

**[Implemented]** — Structured JSON logging in production, pretty-printed in development. HTTP requests logged via `pino-http` with method, path, status, response time, and authenticated user ID. Sensitive headers (`Authorization`, `Cookie`, `X-CSRF-Token`, `Set-Cookie`) are redacted from log output. `/api/health` is excluded from request logs by default to reduce noise.
