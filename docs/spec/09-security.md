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

## 9.3 Rate Limiting **[Implemented]**

| Limiter | Window | Max Requests | Scope |
|---|---|---|---|
| Global | 15 minutes | 100 per IP | All requests (applied before session middleware) |
| Auth | 1 minute | 10 per IP | `/api/auth` endpoints only |

Returns `429 Too Many Requests` with `RateLimit-*` and `Retry-After` headers.

## 9.4 Redirect Validation **[Implemented]**

Logout redirect URLs are validated client-side via `validateRedirectUrl()`:
- Relative paths allowed (`/services`)
- Same-origin URLs allowed
- External HTTPS URLs allowed (for OIDC end-session endpoints)
- All other URLs rejected (prevents open redirect)

## 9.5 Middleware Application Order **[Implemented]**

The order matters — each layer builds on previous:

| Order | Middleware | Purpose |
|---|---|---|
| 1 | Trust Proxy | Sets `req.secure`, `req.ip` from `X-Forwarded-*` headers |
| 2 | Security Headers | Helmet CSP, X-Frame-Options, etc. |
| 3 | HTTPS Redirect | 301 redirect if enabled |
| 4 | CORS | `credentials: true`, configurable origin |
| 5 | JSON Parser | `express.json()` body parsing |
| 6 | Global Rate Limit | 100 req/15min per IP — early rejection before session creation |
| 7 | Session | Populates `req.session` |
| 8 | Auth Bypass | Dev-only auto-auth |
| 9 | Request Logger | `pino-http` structured logging (method, path, status, response time, userId) |
| 10 | CSRF Protection | Double-submit cookie validation on `/api` routes |
| 11 | Auth Rate Limit | 10 req/1min on `/api/auth` |
| 12 | Route Handlers | API endpoints with auth middleware |
| 13 | Static Files + SPA | Serves `client/dist/` with compression and catch-all |
