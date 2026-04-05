# 9. Security

## 9.1 Security Headers **[Implemented]**

Applied via Helmet middleware on all responses:

| Header | Value |
|---|---|
| Content-Security-Policy | `default-src 'self'`; `style-src 'self' 'unsafe-inline'`; `object-src 'none'`; `frame-ancestors 'none'`. Dev adds `'unsafe-eval'` and `ws:` for Vite HMR. |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Strict-Transport-Security | Production only: `max-age=31536000; includeSubDomains` |
| Referrer-Policy | Helmet default (`no-referrer`) |

## 9.2 HTTPS Redirect **[Implemented]**

When `REQUIRE_HTTPS=true`:
- All HTTP requests receive a 301 redirect to HTTPS equivalent
- `/api/health` is exempt (for load balancer probes)
- Requires `TRUST_PROXY` to be set when behind a reverse proxy (so `req.secure` is correct)

## 9.3 Direct HTTPS **[Implemented]**

Depsera can terminate TLS itself without a reverse proxy via `ENABLE_HTTPS=true`.

**Behavior:**

| Configuration | Result |
|---|---|
| `ENABLE_HTTPS=false` (default) | Plain HTTP on `PORT` — unchanged |
| `ENABLE_HTTPS=true` + `SSL_CERT_PATH` / `SSL_KEY_PATH` | Load the provided PEM cert/key, HTTPS on `PORT` |
| `ENABLE_HTTPS=true` + no cert paths | Generate a self-signed certificate at startup, HTTPS on `PORT` |
| `HTTP_PORT` set (any of the above HTTPS modes) | Start a minimal HTTP server on `HTTP_PORT`: `/api/health` returns 200, all other requests receive a 301 redirect to the HTTPS URL |

**When to use direct HTTPS vs reverse proxy:**

- **Direct HTTPS** is suited to small / single-node deployments, Docker containers exposed directly, or development/staging environments where a reverse proxy is unnecessary overhead.
- **Reverse proxy** (nginx, Caddy) is preferred when you need load balancing, centralized TLS certificate management, or advanced routing rules. In that case leave `ENABLE_HTTPS=false` and configure `TRUST_PROXY` + `REQUIRE_HTTPS` instead.

**Self-signed certificates:**

When no cert paths are provided, the server generates a self-signed certificate on each startup. Browsers and HTTP clients will show TLS warnings. This is intended for development and internal testing only.

**Interaction with `REQUIRE_HTTPS` and `TRUST_PROXY`:**

- When `ENABLE_HTTPS=true`, `REQUIRE_HTTPS` is not needed — the server is already HTTPS. If `HTTP_PORT` is set, the HTTP listener redirects automatically.
- `TRUST_PROXY` is only relevant when Depsera is behind a reverse proxy. When using direct HTTPS it can be left unset.

## 9.4 Rate Limiting **[Implemented]**

### IP-Based Rate Limiters

| Limiter | Window | Max Requests | Scope |
|---|---|---|---|
| Global | 1 minute | 3,000 per IP | All requests (applied before session middleware) |
| Auth | 1 minute | 20 per IP | `/api/auth` endpoints only |
| OTLP Global | 1 minute | 600 per IP | `POST /v1/metrics` only (applied before API key auth) |

Returns `429 Too Many Requests` with `RateLimit-*` and `Retry-After` headers.

### Per-Key Rate Limiting **[Implemented]**

In addition to the IP-based OTLP global limiter, each API key is individually rate-limited via a **token bucket** algorithm.

**Algorithm:** Token bucket with continuous refill.
- **Bucket capacity:** `(effective_rpm / 60) × OTLP_RATE_LIMIT_BURST_SECONDS` tokens
- **Refill rate:** `effective_rpm / 60 / 1000` tokens per millisecond
- **Lazy initialization:** Buckets are created on first request per key
- **Eviction:** Buckets are evicted when a key's rate limit is changed (via admin or team endpoint), forcing re-initialization on next request

**Rate limit resolution hierarchy:**
1. `rate_limit_rpm = 0` → Unlimited (admin-only) — rate limiting skipped entirely
2. `rate_limit_rpm = N` (non-null) → Custom limit of N requests/minute
3. `rate_limit_rpm = NULL` → System default from `OTLP_PER_KEY_RATE_LIMIT_RPM` env var (default: 150,000)

**On rejection (429):** Returns OTLP-compatible response `{ partialSuccess: { rejectedDataPoints: 0, errorMessage: "..." } }` with `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`, and `X-RateLimit-Key` headers. Rejected requests are counted in usage tracking (`rejected_count`).

**Soft limit warning:** When usage exceeds `OTLP_RATE_LIMIT_WARNING_THRESHOLD` (default: 80%) of bucket capacity, the response includes an `X-RateLimit-Warning: true` header. A server-side warning is logged at most once per 15 minutes per key.

**Development bypass:** Per-key rate limiting is skipped entirely when `NODE_ENV === 'development'`.

| Environment Variable | Default | Description |
|---|---|---|
| `OTLP_PER_KEY_RATE_LIMIT_RPM` | `150000` | Default per-key rate limit (requests/minute) when `rate_limit_rpm` is NULL |
| `OTLP_RATE_LIMIT_BURST_SECONDS` | `6` | Burst window; bucket capacity = refill rate × burst seconds |
| `OTLP_RATE_LIMIT_WARNING_THRESHOLD` | `0.80` | Fraction of capacity consumed before warning header is set |

## 9.5 Redirect Validation **[Implemented]**

Logout redirect URLs are validated client-side via `validateRedirectUrl()`:
- Relative paths allowed (`/services`)
- Same-origin URLs allowed
- External HTTPS URLs allowed (for OIDC end-session endpoints)
- All other URLs rejected (prevents open redirect)

## 9.6 Middleware Application Order **[Implemented]**

The order matters — each layer builds on previous:

| Order | Middleware | Purpose |
|---|---|---|
| 1 | Trust Proxy | Sets `req.secure`, `req.ip` from `X-Forwarded-*` headers |
| 2 | Security Headers | Helmet CSP, X-Frame-Options, etc. |
| 3 | HTTPS Redirect | 301 redirect if enabled |
| 4 | CORS | `credentials: true`, configurable origin |
| 5 | JSON Parser | `express.json()` body parsing |
| 5.5 | OTLP Route | `POST /v1/metrics` — JSON (1MB limit), OTLP global rate limit (600/min per IP), API key auth, per-key rate limit (token bucket), usage tracking, OTLP router. Mounted before session/CSRF. |
| 6 | Global Rate Limit | 3,000 req/min per IP — early rejection before session creation |
| 7 | Session | Populates `req.session` |
| 8 | Auth Bypass | Dev-only auto-auth |
| 9 | Request Logger | `pino-http` structured logging (method, path, status, response time, userId) |
| 10 | CSRF Protection | Double-submit cookie validation on `/api` routes |
| 11 | Auth Rate Limit | 10 req/1min on `/api/auth` |
| 12 | Route Handlers | API endpoints with auth middleware |
| 13 | Static Files + SPA | Serves `client/dist/` with compression and catch-all |
