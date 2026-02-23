# Administration Guide

This guide covers day-to-day administration of Depsera: first-run setup, user and team management, alert configuration, admin settings, data retention, and troubleshooting. For installation and deployment, see the [Installation Guide](installation.md).

---

## Table of Contents

- [First-Run Setup](#first-run-setup)
  - [Local Auth Mode](#local-auth-mode)
  - [OIDC Mode](#oidc-mode)
- [User Management](#user-management)
  - [User Roles](#user-roles)
  - [Creating Users (Local Auth)](#creating-users-local-auth)
  - [Resetting Passwords (Local Auth)](#resetting-passwords-local-auth)
  - [Changing User Roles](#changing-user-roles)
  - [Deactivating and Reactivating Users](#deactivating-and-reactivating-users)
- [Team Management](#team-management)
  - [Team Member Roles](#team-member-roles)
  - [Creating Teams](#creating-teams)
  - [Managing Members](#managing-members)
  - [Team-Scoped Access](#team-scoped-access)
- [Alert Configuration](#alert-configuration)
  - [Alert Channels](#alert-channels)
  - [Alert Rules](#alert-rules)
  - [Alert History](#alert-history)
  - [Flap Protection and Rate Limiting](#flap-protection-and-rate-limiting)
- [Admin Settings](#admin-settings)
  - [Data Retention](#data-retention)
  - [Polling Defaults](#polling-defaults)
  - [Security](#security)
  - [Alerts](#alerts)
- [SSRF Allowlist](#ssrf-allowlist)
- [Data Retention and Cleanup](#data-retention-and-cleanup)
- [Audit Log](#audit-log)
- [Monitoring and Observability](#monitoring-and-observability)
  - [Health Endpoint](#health-endpoint)
  - [Logging](#logging)
  - [Polling Health](#polling-health)
- [Troubleshooting](#troubleshooting)

---

## First-Run Setup

Depsera supports two authentication modes: **local auth** (username/password) and **OIDC** (enterprise SSO). Choose one — they are mutually exclusive.

### Local Auth Mode

Local auth is the simplest option for standalone deployments.

**1. Set environment variables:**

```bash
LOCAL_AUTH=true
ADMIN_EMAIL=admin@yourcompany.com
ADMIN_PASSWORD=a-strong-password    # minimum 8 characters
SESSION_SECRET=<random-32+-chars>   # required in production
```

**2. Start Depsera.** On first startup with no existing users, Depsera creates the initial admin account from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. You'll see this in the logs:

```
local auth: initial admin user created
```

**3. Log in** at `http://localhost:3001` (or your configured URL) with the admin email and password.

**4. Change the default password** via the admin user management page (`/admin/users`) if you used a temporary password.

> **Note:** `ADMIN_EMAIL` and `ADMIN_PASSWORD` are only used on first startup when no users exist. Changing them later has no effect — use the password reset feature in the UI instead.

### OIDC Mode

OIDC mode integrates with enterprise identity providers (Okta, Azure AD, Google Workspace, Keycloak, etc.).

**1. Register Depsera with your OIDC provider:**
- **Redirect URI:** `https://depsera.yourdomain.com/api/auth/callback`
- **Scopes:** `openid email profile`
- **Grant type:** Authorization Code with PKCE

**2. Set environment variables:**

```bash
OIDC_ISSUER_URL=https://your-idp.example.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=https://depsera.yourdomain.com/api/auth/callback
SESSION_SECRET=<random-32+-chars>
```

**3. Start Depsera** and navigate to the login page. Click "Login with SSO".

**4. The first user to log in is automatically bootstrapped as admin.** All subsequent users are created with the `user` role. You can promote additional admins from the user management page.

> **Tip:** To check which auth mode is active, call `GET /api/auth/mode` — it returns `{ "mode": "oidc" }` or `{ "mode": "local" }`.

---

## User Management

User management is available at `/admin/users` (admin only).

### User Roles

| Role | Scope |
|------|-------|
| `admin` | Full system access. Can manage users, teams, services, and settings. Bypasses team membership checks. |
| `user` | Access scoped to team membership. Can view org-wide dashboards (graph, wallboard, dashboard). |

### Creating Users (Local Auth)

In local auth mode, admins can create user accounts from the user management page:

1. Navigate to `/admin/users`
2. Click **Create User**
3. Fill in email, display name, password (8+ characters), and role
4. Click **Save**

The new user can immediately log in with the provided credentials.

> **Note:** User creation is only available in local auth mode. In OIDC mode, users are created automatically on first login.

### Resetting Passwords (Local Auth)

1. Navigate to `/admin/users`
2. Find the user and click **Reset Password**
3. Enter the new password (8+ characters) and confirm
4. Click **Reset**

> **Note:** Password reset is only available in local auth mode.

### Changing User Roles

1. Navigate to `/admin/users`
2. Find the user and click the role toggle (Admin/User)
3. The role changes immediately

**Constraint:** You cannot demote the last active admin. At least one admin must always exist.

### Deactivating and Reactivating Users

**Deactivate:**
1. Navigate to `/admin/users`
2. Find the user and click **Deactivate**
3. Confirm the action

Deactivated users cannot log in. Their active sessions are invalidated on the next API request (not immediately). The user is automatically removed from all teams.

**Reactivate:**
1. Find the deactivated user (use the "Inactive Only" filter)
2. Click **Reactivate**
3. Confirm the action

The user can log in again, but they will need to be re-added to teams manually.

**Constraint:** You cannot deactivate the last active admin.

---

## Team Management

Teams are the primary organizational unit in Depsera. Services are owned by teams, and access control is enforced at the team level.

### Team Member Roles

| Role | Permissions |
|------|------------|
| `lead` | Create, edit, delete, and poll services. Manage alert channels and rules. Manage team members. |
| `member` | View team services and dependencies. Trigger manual polls. Read-only access to alert rules and history. |

Admin users bypass team membership checks and have full access to all teams.

### Creating Teams

1. Navigate to `/teams`
2. Click **Create Team**
3. Enter a team name and optional description
4. Click **Save**

Team names must be unique across the organization.

### Managing Members

On the team detail page:

1. Click **Add Member**
2. Select a user and assign a role (lead or member)
3. Click **Add**

To change a member's role or remove them, use the member actions on the team detail page.

### Team-Scoped Access

Non-admin users only see services belonging to their teams:

- `GET /api/services` returns only the user's team services
- Service detail, edit, and delete require team membership
- Manual polling (`POST /api/services/:id/poll`) requires team membership

**Org-wide views** (dependency graph, wallboard, dashboard) show all services regardless of team membership, giving everyone visibility into overall system health.

---

## Alert Configuration

Alerts notify your team when service health changes. Configuration is per-team — each team independently manages its alert channels, rules, and history.

### Alert Channels

Alert channels define where notifications are sent. Navigate to your team's detail page to manage channels.

**Slack:**
1. Create a [Slack incoming webhook](https://api.slack.com/messaging/webhooks) in your Slack workspace
2. On the team detail page, click **Add Channel**
3. Select **Slack** as the channel type
4. Paste the webhook URL (must start with `https://hooks.slack.com/services/`)
5. Click **Save**

Slack messages use Block Kit formatting with:
- Status emoji and service name in the header
- Dependency name and status transition details
- Severity badge and timestamp
- "View in Depsera" button (requires `APP_BASE_URL` to be set)

**Generic Webhook:**
1. On the team detail page, click **Add Channel**
2. Select **Webhook** as the channel type
3. Enter the webhook URL
4. Optionally select an HTTP method (POST, PUT, or PATCH — defaults to POST)
5. Optionally add custom headers (for auth tokens, API keys)
6. Click **Save**

Webhook payloads are JSON:

```json
{
  "event": "dependency_status_change",
  "service": { "id": "...", "name": "..." },
  "dependency": { "id": "...", "name": "..." },
  "oldStatus": "healthy",
  "newStatus": "critical",
  "severity": "critical",
  "timestamp": "2026-01-15T10:00:00.000Z",
  "url": "https://depsera.yourdomain.com/services/..."
}
```

**Testing channels:** Click the **Test** button on any channel to send a test alert and verify connectivity. The test result shows whether the message was delivered successfully.

**Enabling/disabling channels:** Use the toggle on each channel to enable or disable it without deleting the configuration.

### Alert Rules

Alert rules control which events trigger notifications. On the team detail page, find the **Alert Rules** section.

**Severity filter options:**
- **Critical only** — Alerts only on critical-level health changes
- **Warning and above** — Alerts on warning and critical changes
- **All status changes** — Alerts on any health state transition

**Enable/disable toggle:** Turns all alerting on or off for the team.

Team members see a read-only summary. Team leads and admins can edit rules.

### Alert History

The alert history table shows the last 50 alerts in reverse chronological order with:
- Timestamp
- Service and dependency names
- Event type (status change or poll error)
- Delivery status: **sent**, **failed**, or **suppressed**
- Channel type (Slack or Webhook)

Use the status filter dropdown to show only specific outcomes (e.g., failed alerts only).

### Flap Protection and Rate Limiting

Depsera includes built-in safeguards to prevent alert storms:

**Flap protection:** If a dependency repeatedly toggles between healthy and unhealthy, repeated alerts for the same dependency are suppressed within a cooldown window (default: 5 minutes). Suppressed alerts are recorded in history with status "suppressed".

**Rate limiting:** Each team is limited to a maximum number of alerts per hour (default: 30). Once the limit is reached, further alerts are suppressed until the window resets.

Both values are configurable via [Admin Settings](#alerts).

---

## Admin Settings

The admin settings page (`/admin/settings`) allows runtime configuration without restarting the server. Changes take effect immediately.

Environment variables serve as initial defaults. Once a setting is changed via the admin page, the database value takes precedence.

### Data Retention

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| Retention period (days) | 1–3,650 | 365 | How long to keep historical data |
| Daily cleanup time | HH:MM | 02:00 | When the daily cleanup job runs (local server time) |

Applies to: latency history, error history, audit log, and alert history.

### Polling Defaults

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| Default poll interval (ms) | 5,000–3,600,000 | 30,000 | Default interval for newly created services |

Individual services can override this value. Existing services are not affected when this default changes.

### Security

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| SSRF allowlist | — | From env var | Hostnames, wildcards, and CIDRs to allow for health polling |
| Global rate limit (requests) | 1–10,000 | 300 | Max API requests per IP per window |
| Global rate limit window (minutes) | 1–1,440 | 15 | Window duration for global rate limit |
| Auth rate limit (requests) | 1–1,000 | 10 | Max auth requests per IP per window |
| Auth rate limit window (minutes) | 1–1,440 | 1 | Window duration for auth rate limit |

### Alerts

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| Alert cooldown (minutes) | 0–1,440 | 5 | Flap protection cooldown per dependency |
| Max alerts per hour | 1–1,000 | 30 | Per-team hourly alert limit |

---

## SSRF Allowlist

By default, Depsera blocks health endpoint polling to private/reserved IP ranges to prevent SSRF attacks. If you need to monitor internal services, configure the SSRF allowlist.

**Supported entry types:**
- **Exact hostnames:** `localhost`, `my-api-server`
- **Wildcard patterns:** `*.internal`, `*.corp.example.com`
- **CIDR ranges:** `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`

**Configuration methods:**

1. **Environment variable:** `SSRF_ALLOWLIST` (comma-separated)
   ```bash
   SSRF_ALLOWLIST="*.internal,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
   ```

2. **Admin settings page:** Enter one entry per line in the SSRF allowlist textarea. Database values override the environment variable.

**Blocked by default:**
- Loopback: `127.0.0.0/8`, `::1`
- RFC 1918 private: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- Link-local: `169.254.0.0/16`, `fe80::/10`
- Other reserved ranges (multicast, carrier-grade NAT, etc.)

**Two-stage validation:** URLs are checked at service creation time (hostname/IP pattern check) and again at poll time (DNS resolution check to prevent DNS rebinding attacks). The allowlist is applied at both stages.

**Example:** To monitor services on your `10.x.x.x` corporate network:

```bash
SSRF_ALLOWLIST="10.0.0.0/8,*.corp.example.com"
```

---

## Data Retention and Cleanup

Depsera automatically cleans up old data to prevent unbounded database growth.

**What gets cleaned:**
- `dependency_latency_history` — historical latency data points
- `dependency_error_history` — error records per dependency
- `audit_log` — admin action audit trail
- `alert_history` — alert delivery records

**Schedule:**
- Runs once daily at the configured cleanup time (default: 02:00 local server time)
- The scheduler checks every 60 seconds whether it's time to run
- If the server was down during the scheduled time, cleanup runs on the next startup

**Configuration:**
- **Retention period:** `DATA_RETENTION_DAYS` env var or `data_retention_days` admin setting (default: 365 days)
- **Cleanup time:** `RETENTION_CLEANUP_TIME` env var or `retention_cleanup_time` admin setting (default: `02:00`)

The number of deleted rows per table is logged at `info` level after each cleanup run.

> **Tip:** Schedule backups before the cleanup time (e.g., backup at 01:00, cleanup at 02:00) to ensure no data is lost.

---

## Audit Log

All admin actions are automatically recorded in the audit log for accountability and compliance.

**Audited actions:**
- User creation, deactivation, reactivation, and role changes
- Password resets (the new password is never logged)
- Team creation, updates, and deletion
- Team member additions, role changes, and removals
- Service creation, updates, and deletion
- Admin settings changes (includes which keys were updated)

Each entry records: the acting user, action type, affected resource, IP address, and a JSON details object.

**Querying the audit log:**

```bash
# All audit entries (last 50)
curl -H "Cookie: ..." https://depsera.example.com/api/admin/audit-log

# Filter by date range
curl "https://depsera.example.com/api/admin/audit-log?startDate=2026-02-01&endDate=2026-02-28"

# Filter by action type
curl "https://depsera.example.com/api/admin/audit-log?action=user.role_changed"

# Filter by resource type
curl "https://depsera.example.com/api/admin/audit-log?resourceType=team"

# Pagination
curl "https://depsera.example.com/api/admin/audit-log?limit=100&offset=50"
```

Available filters: `startDate`, `endDate` (ISO-8601), `userId`, `action`, `resourceType` (`user`, `team`, `service`, `settings`). Max `limit` is 250.

Audit log entries are subject to data retention cleanup.

---

## Monitoring and Observability

### Health Endpoint

```bash
curl http://localhost:3001/api/health
# Response: { "status": "ok" }
```

- **No authentication required** — suitable for load balancer probes
- **Not rate-limited** — won't count against API rate limits
- **Not logged** — won't generate noise in request logs
- Confirms the server process is running. Does not probe dependencies or polling health.

**Docker health check:** The Docker image includes a built-in health check (`curl -f http://localhost:3001/api/health`) with 30s interval, 5s timeout, 10s start period, and 3 retries.

### Logging

Depsera uses structured logging via Pino.

**Format:**
- **Development:** Pretty-printed, colorized, human-readable
- **Production (`NODE_ENV=production`):** JSON — suitable for log aggregation (Datadog, Splunk, ELK)

**Log level:** Controlled via `LOG_LEVEL` env var (default: `info`). Levels from most to least verbose: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`.

**What gets logged:**
- All HTTP requests: method, path, status code, response time, authenticated user ID
- Server lifecycle: startup, shutdown, auth mode initialization
- Polling events: poll results, circuit breaker state changes, backoff
- Data retention: cleanup results with row counts per table
- Security: SSRF allowlist configuration, insecure cookie warnings

**Sensitive data redacted:** `Authorization`, `Cookie`, `X-CSRF-Token`, and `Set-Cookie` headers are automatically stripped from logs.

**Tips:**
- Use `LOG_LEVEL=debug` when troubleshooting polling or SSRF issues
- Use `LOG_LEVEL=warn` in high-volume environments to reduce noise
- In production, pipe JSON logs to your aggregation tool for searchability

### Polling Health

Monitor the polling system's behavior through logs and the service detail page:

**Circuit breaker:** After 10 consecutive poll failures for a service, the circuit breaker opens and skips polls for 5 minutes. After cooldown, a single probe is attempted (half-open state). Success closes the circuit; failure re-opens it. Circuit state changes are logged at `info` level.

**Exponential backoff:** On poll failure, the retry delay increases exponentially (1s → 2s → 4s → ... → 5min max). Resets to normal interval on success.

**Host concurrency:** Each target hostname is limited to 5 concurrent polls (configurable via `POLL_MAX_CONCURRENT_PER_HOST`) to prevent overwhelming target services. Services that can't acquire a slot are retried on the next 5-second tick.

**Poll deduplication:** If multiple services share the same health endpoint URL, only one HTTP request is made per poll cycle.

---

## Troubleshooting

### Server won't start

**"SESSION_SECRET is required in production"**
Set `SESSION_SECRET` to a cryptographically random string of at least 32 characters:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**"SESSION_SECRET is too weak"**
Your secret matches a known default. Generate a new one with the command above.

**"ADMIN_EMAIL and ADMIN_PASSWORD are required"**
When `LOCAL_AUTH=true` and no users exist, both env vars are required to bootstrap the initial admin.

**"Cannot configure both LOCAL_AUTH and OIDC"**
Remove either `LOCAL_AUTH=true` or the `OIDC_*` variables. The two modes are mutually exclusive.

### Login issues

**OIDC: "Login failed" after redirect**
- Verify `OIDC_REDIRECT_URI` matches exactly what's registered with your identity provider (including protocol and path)
- Check that `OIDC_ISSUER_URL` is reachable from the server (not just the browser)
- If behind a reverse proxy, ensure `TRUST_PROXY` is set so the callback URL matches

**Local auth: "Invalid email or password"**
- Email comparison is case-sensitive
- If you've forgotten the admin password and have no other admins, you'll need to reset the database or create a new one

**Session cookies not persisting**
- If behind a reverse proxy, set `TRUST_PROXY=true` so the `Secure` cookie flag is set correctly
- If accessing via HTTP (not HTTPS) in non-development mode, cookies may not be sent. Set `REQUIRE_HTTPS=true` with a reverse proxy handling TLS

### Services not polling

**"SSRF blocked" error on service creation**
The health endpoint URL resolves to a private IP. Add the host or IP range to `SSRF_ALLOWLIST`:
```bash
SSRF_ALLOWLIST="10.0.0.0/8,*.internal"
```

**Service shows "circuit open"**
The service has failed 10 consecutive polls. Check:
1. Is the health endpoint URL correct and reachable from the Depsera server?
2. Is the target service actually running?
3. Are there firewall rules blocking the connection?

The circuit breaker will automatically retry after 5 minutes. You can also trigger a manual poll from the service detail page.

**Polls are slow or timing out**
- Default HTTP timeout for polls is 10 seconds
- Check network connectivity between Depsera and the target service
- If many services share a hostname, the per-host concurrency limit (default 5) may cause queuing

### Alerts not sending

**No alerts despite health changes**
1. Verify alert rules are **enabled** on the team detail page
2. Check that an alert channel is configured and **active**
3. Verify the severity filter matches — "Critical only" won't alert on warning-level changes
4. Check alert history for "suppressed" entries (flap protection or rate limiting)

**Slack alerts failing**
- Verify the webhook URL starts with `https://hooks.slack.com/services/`
- Use the **Test** button to verify connectivity
- Check if Slack is returning 429 (rate limited) — Depsera logs this

**Webhook alerts failing**
- Verify the target URL is reachable from the Depsera server
- Check if custom headers are correct (e.g., auth tokens)
- Review alert history for the specific error message

**"Suppressed" alerts in history**
- **Flap protection:** The same dependency alerted within the cooldown window (default 5 min). Adjust `alert_cooldown_minutes` in admin settings if needed
- **Rate limited:** The team exceeded its hourly alert limit (default 30). Adjust `alert_rate_limit_per_hour` in admin settings if needed

### Performance

**Database growing large**
- Check data retention settings — the default 365-day retention may be too long for high-volume deployments
- Reduce `data_retention_days` via admin settings
- The daily cleanup job runs at the configured time; verify it's running by checking logs for retention cleanup entries

**High memory usage**
- Depsera keeps polling state, circuit breakers, and session data in memory
- With many services (100+), memory usage grows proportionally
- Consider increasing poll intervals to reduce concurrent state

### Permission errors

**403 Forbidden on service operations**
- Non-admin users can only manage services belonging to their teams
- Service creation requires team lead role (or admin)
- Service viewing requires team membership (or admin)

**404 on user management endpoints**
- `POST /api/users` and `PUT /api/users/:id/password` return 404 (not 403) when not in local auth mode. This is intentional — these endpoints are hidden in OIDC mode.

**Cannot demote admin**
- At least one active admin must exist at all times. Promote another user to admin first.
