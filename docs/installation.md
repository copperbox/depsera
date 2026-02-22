# Installation Guide

This guide covers deploying Depsera for production use. For development setup, see the [README](../README.md).

---

## Table of Contents

- [Quick Start (Docker Compose)](#quick-start-docker-compose)
- [Docker](#docker)
  - [Docker Compose](#docker-compose)
  - [Docker Run](#docker-run)
  - [Building the Image](#building-the-image)
- [Bare Node.js](#bare-nodejs)
  - [Prerequisites](#prerequisites)
  - [Install and Build](#install-and-build)
  - [Running](#running)
  - [Process Management](#process-management)
- [Reverse Proxy](#reverse-proxy)
  - [nginx](#nginx)
  - [Caddy](#caddy)
- [Configuration Reference](#configuration-reference)
  - [Core](#core)
  - [Authentication](#authentication)
  - [Security](#security)
  - [Rate Limiting](#rate-limiting)
  - [Polling](#polling)
  - [Alerting](#alerting)
  - [Data Retention](#data-retention)
  - [Logging](#logging)
  - [Admin Settings (Runtime)](#admin-settings-runtime)
- [Production Checklist](#production-checklist)
- [Backup and Restore](#backup-and-restore)
  - [Backup](#backup)
  - [Restore](#restore)
  - [Automated Backups](#automated-backups)
- [Upgrading](#upgrading)

---

## Quick Start (Docker Compose)

The fastest way to get Depsera running:

```bash
# 1. Clone the repository
git clone https://github.com/your-org/depsera.git
cd depsera

# 2. Generate a session secret
export SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")

# 3. Start with Docker Compose
docker compose up -d

# 4. Open http://localhost:3001
#    Default login: admin@example.com / changeme123
```

> **Important:** Change `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `docker-compose.yml` before deploying to production. See the [Production Checklist](#production-checklist).

---

## Docker

### Docker Compose

Docker Compose is the recommended deployment method. The included `docker-compose.yml` provides sensible defaults.

**1. Edit `docker-compose.yml`:**

```yaml
services:
  depsera:
    build: .
    image: depsera
    ports:
      - "3001:3001"
    environment:
      # Required: generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
      - SESSION_SECRET=your-secure-random-string-at-least-32-chars

      # Local auth (username/password)
      - LOCAL_AUTH=true
      - ADMIN_EMAIL=admin@yourdomain.com
      - ADMIN_PASSWORD=a-strong-password

      # OR use OIDC (comment out LOCAL_AUTH lines above)
      # - OIDC_ISSUER_URL=https://your-idp.example.com
      # - OIDC_CLIENT_ID=your-client-id
      # - OIDC_CLIENT_SECRET=your-client-secret
      # - OIDC_REDIRECT_URI=https://depsera.yourdomain.com/api/auth/callback

      # Recommended for production
      # - TRUST_PROXY=true
      # - REQUIRE_HTTPS=true
      # - APP_BASE_URL=https://depsera.yourdomain.com
      # - SSRF_ALLOWLIST=*.internal,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
    volumes:
      - depsera-data:/app/server/data
    restart: unless-stopped

volumes:
  depsera-data:
```

**2. Start:**

```bash
docker compose up -d
```

**3. View logs:**

```bash
docker compose logs -f depsera
```

**4. Stop:**

```bash
docker compose down
```

Data is persisted in the `depsera-data` named volume. Removing the container does not delete data — only `docker volume rm depsera-data` does.

### Docker Run

Run Depsera without Docker Compose:

```bash
docker run -d \
  --name depsera \
  -p 3001:3001 \
  -v depsera-data:/app/server/data \
  -e SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))") \
  -e LOCAL_AUTH=true \
  -e ADMIN_EMAIL=admin@example.com \
  -e ADMIN_PASSWORD=changeme123 \
  --restart unless-stopped \
  depsera
```

### Building the Image

```bash
docker build -t depsera .
```

The multi-stage build:
1. Installs build tools (Python, make, g++) for native SQLite compilation
2. Builds both server (TypeScript) and client (Vite)
3. Creates a minimal production image with only runtime dependencies
4. Runs as non-root `node` user

The built image includes a health check: `curl -f http://localhost:3001/api/health` (30s interval, 5s timeout, 10s start period).

---

## Bare Node.js

### Prerequisites

- **Node.js 22+** (LTS recommended)
- **npm** (included with Node.js)
- **Build tools** for native modules: Python 3, make, g++ (or Visual Studio Build Tools on Windows)

### Install and Build

```bash
# Clone the repository
git clone https://github.com/your-org/depsera.git
cd depsera

# Install all dependencies (root, server, client)
npm run install:all

# Build both packages
npm run build
```

### Running

**1. Create environment file:**

```bash
cp server/.env.example server/.env
```

**2. Edit `server/.env`** — at minimum, set:

```bash
# Required in production
NODE_ENV=production
SESSION_SECRET=your-secure-random-string-at-least-32-chars

# Choose one auth mode:

# Option A: Local auth
LOCAL_AUTH=true
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=a-strong-password

# Option B: OIDC
# OIDC_ISSUER_URL=https://your-idp.example.com
# OIDC_CLIENT_ID=your-client-id
# OIDC_CLIENT_SECRET=your-client-secret
# OIDC_REDIRECT_URI=https://depsera.yourdomain.com/api/auth/callback
```

**3. Run database migrations:**

```bash
cd server
npm run db:migrate
```

**4. Start the server:**

```bash
cd server
npm start
```

The server listens on port 3001 (configurable via `PORT`). In production mode, it automatically serves the built client from `client/dist/` with compression and SPA catch-all routing. No separate web server is required.

### Process Management

For production deployments, use a process manager to keep Depsera running:

**systemd (Linux):**

Create `/etc/systemd/system/depsera.service`:

```ini
[Unit]
Description=Depsera
After=network.target

[Service]
Type=simple
User=depsera
WorkingDirectory=/opt/depsera/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
EnvironmentFile=/opt/depsera/server/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable depsera
sudo systemctl start depsera
```

**PM2:**

```bash
npm install -g pm2

cd /opt/depsera/server
pm2 start dist/index.js --name depsera
pm2 save
pm2 startup
```

---

## Reverse Proxy

When running behind a reverse proxy, you **must** configure:

1. `TRUST_PROXY=true` (or a specific value — see [Configuration Reference](#security)) so Express reads `X-Forwarded-*` headers correctly
2. Optionally `REQUIRE_HTTPS=true` to redirect HTTP to HTTPS

### nginx

```nginx
server {
    listen 80;
    server_name depsera.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name depsera.yourdomain.com;

    ssl_certificate /etc/ssl/certs/depsera.crt;
    ssl_certificate_key /etc/ssl/private/depsera.key;

    # Recommended SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (for future use)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Set in your Depsera environment:

```bash
TRUST_PROXY=true
REQUIRE_HTTPS=true
```

### Caddy

Caddy automatically provisions and renews TLS certificates via Let's Encrypt.

```
depsera.yourdomain.com {
    reverse_proxy localhost:3001
}
```

Set in your Depsera environment:

```bash
TRUST_PROXY=true
```

Caddy handles HTTPS automatically, so `REQUIRE_HTTPS` is optional (Caddy redirects HTTP to HTTPS by default).

---

## Configuration Reference

All configuration is via environment variables set on the server process. In bare Node.js deployments, use `server/.env`. In Docker, use `environment:` in `docker-compose.yml` or `-e` flags.

### Core

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server listen port |
| `DATABASE_PATH` | `./data/database.sqlite` | SQLite database file path (relative to `server/`) |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin. Only needed in development (separate Vite dev server). In production, the client is served by Express so CORS is not needed. |
| `NODE_ENV` | — | Set to `production` for production deployments. Enables strict session secret validation, JSON logging, and HSTS headers. |

### Authentication

Choose **one** authentication mode. OIDC and local auth are mutually exclusive.

**OIDC (default):**

| Variable | Default | Description |
|----------|---------|-------------|
| `OIDC_ISSUER_URL` | — | OIDC provider discovery URL (e.g., `https://accounts.google.com`) |
| `OIDC_CLIENT_ID` | — | OAuth2 client ID |
| `OIDC_CLIENT_SECRET` | — | OAuth2 client secret |
| `OIDC_REDIRECT_URI` | `http://localhost:3001/api/auth/callback` | OAuth2 callback URL. Must match the redirect URI registered with your OIDC provider. |
| `SESSION_SECRET` | weak default (dev only) | Session signing secret. **Must be at least 32 characters in production.** Generate with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |

**Local auth:**

| Variable | Default | Description |
|----------|---------|-------------|
| `LOCAL_AUTH` | `false` | Set `true` to enable local username/password authentication |
| `ADMIN_EMAIL` | — | Initial admin email address (required on first startup with `LOCAL_AUTH=true`) |
| `ADMIN_PASSWORD` | — | Initial admin password, minimum 8 characters (required on first startup with `LOCAL_AUTH=true`) |
| `SESSION_SECRET` | weak default (dev only) | Same as above |

The first user to authenticate (OIDC) or the user created from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (local auth) is bootstrapped as admin. Additional users can be created by the admin in local auth mode, or are auto-created on first OIDC login.

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `TRUST_PROXY` | — | Express `trust proxy` setting. **Required when behind a reverse proxy.** Accepts: `true` (trust all), a number (hop count), IP/subnet (`10.0.0.0/8`), `loopback`, or a comma-separated list. Enables correct `req.secure`, `req.ip` from `X-Forwarded-*` headers. |
| `REQUIRE_HTTPS` | `false` | Set `true` to 301-redirect all HTTP requests to HTTPS. `/api/health` is exempt so load-balancer health probes still work over HTTP. Requires `TRUST_PROXY` when behind a reverse proxy. |
| `SSRF_ALLOWLIST` | — | Comma-separated list of hostnames, wildcard patterns, and CIDR ranges that bypass SSRF blocking for health endpoint polling. Required for monitoring internal/private-network services. Examples: `localhost,127.0.0.0/8` (local dev), `*.internal,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16` (corporate network). |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | Global rate limit window in milliseconds |
| `RATE_LIMIT_MAX` | `100` | Max requests per IP per global window |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `60000` (1 min) | Auth endpoint (`/api/auth`) rate limit window in milliseconds |
| `AUTH_RATE_LIMIT_MAX` | `10` | Max auth requests per IP per auth window |

The global rate limiter runs before session middleware to reject abusive requests early. Rate-limited responses return `429 Too Many Requests` with `Retry-After` header.

### Polling

| Variable | Default | Description |
|----------|---------|-------------|
| `POLL_MAX_CONCURRENT_PER_HOST` | `3` | Max concurrent health polls per target hostname. Prevents the polling service from being used as a DDoS amplifier. |
| `DEFAULT_POLL_INTERVAL_MS` | `30000` | Default polling interval for new services (milliseconds). Per-service intervals can be configured individually (range: 5,000–3,600,000 ms). |

### Alerting

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_BASE_URL` | — | Base URL for deep links in alert messages (e.g., `https://depsera.yourdomain.com`). Used in Slack and webhook alert payloads to link back to the Depsera UI. |
| `ALERT_COOLDOWN_MINUTES` | `5` | Minimum time between repeated alerts for the same dependency (flap protection) |
| `ALERT_RATE_LIMIT_PER_HOUR` | `30` | Maximum alerts per team per hour |

### Data Retention

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_RETENTION_DAYS` | `365` | Number of days to keep latency history, error history, audit log, and alert history data. Older records are automatically deleted. |
| `RETENTION_CLEANUP_TIME` | `02:00` | Time of day (HH:MM, local time) to run the daily retention cleanup job |

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log verbosity: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |

In production (`NODE_ENV=production`), logs are structured JSON (suitable for log aggregation tools like Datadog, Splunk, ELK). In development, logs are pretty-printed for readability. HTTP requests are logged with method, path, status, response time, and authenticated user ID. Sensitive headers (`Authorization`, `Cookie`, `X-CSRF-Token`) are automatically redacted.

### Admin Settings (Runtime)

The following settings can be changed at runtime via the Admin Settings page (`/admin/settings`) without restarting the server. Environment variables serve as initial defaults; runtime values stored in the database take precedence.

| Setting Key | Default | Description |
|-------------|---------|-------------|
| `data_retention_days` | 365 | Data retention period (days) |
| `retention_cleanup_time` | `02:00` | Daily cleanup schedule (HH:MM) |
| `default_poll_interval_ms` | 30000 | Default poll interval for new services (ms) |
| `ssrf_allowlist` | from env var | SSRF allowlist (overrides env var at runtime) |
| `global_rate_limit` | 100 | Global API rate limit (requests per window) |
| `global_rate_limit_window_minutes` | 15 | Global rate limit window (minutes) |
| `auth_rate_limit` | 10 | Auth endpoint rate limit (requests per window) |
| `auth_rate_limit_window_minutes` | 1 | Auth rate limit window (minutes) |
| `alert_cooldown_minutes` | 5 | Alert flap protection cooldown (minutes) |
| `alert_rate_limit_per_hour` | 30 | Max alerts per team per hour |

---

## Production Checklist

Before deploying to production, verify:

- [ ] **`NODE_ENV=production`** — Enables strict session secret validation, JSON logging, and HSTS
- [ ] **`SESSION_SECRET`** — Set to a cryptographically random string of at least 32 characters. The server refuses to start in production with a weak or missing secret.
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- [ ] **Authentication configured** — Either `LOCAL_AUTH=true` with strong `ADMIN_PASSWORD`, or OIDC with all four variables set (`OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`)
- [ ] **`TRUST_PROXY`** — Set if behind a reverse proxy (nginx, Caddy, AWS ALB, etc.)
- [ ] **`REQUIRE_HTTPS=true`** — Enabled if handling HTTPS via reverse proxy
- [ ] **`APP_BASE_URL`** — Set to the public URL for deep links in alert messages
- [ ] **`SSRF_ALLOWLIST`** — Configured to allow polling of your internal services while keeping the default block list for security
- [ ] **Data volume** — SQLite data directory (`/app/server/data` in Docker, or `server/data/` bare) is on persistent storage
- [ ] **Backups** — Automated backup strategy in place (see [Backup and Restore](#backup-and-restore))
- [ ] **Default credentials changed** — If using local auth, change the default admin email and password

---

## Backup and Restore

Depsera stores all data in a single SQLite database file. The default location is `server/data/database.sqlite` (or `/app/server/data/database.sqlite` in Docker).

### Backup

SQLite supports safe online backups while the application is running, thanks to WAL (Write-Ahead Logging) mode.

**Option 1: File copy (simple)**

The SQLite database uses `synchronous = FULL` and WAL mode, so a file copy is safe while the application is running as long as you copy all related files:

```bash
# Copy the database and WAL files
cp server/data/database.sqlite backup/database.sqlite
cp server/data/database.sqlite-wal backup/database.sqlite-wal 2>/dev/null
cp server/data/database.sqlite-shm backup/database.sqlite-shm 2>/dev/null
```

**Option 2: SQLite backup command (recommended)**

The `sqlite3` CLI tool provides an atomic backup that handles WAL checkpointing:

```bash
sqlite3 server/data/database.sqlite ".backup 'backup/database.sqlite'"
```

**Option 3: Docker volume backup**

```bash
# Create a backup from a running container
docker run --rm \
  -v depsera-data:/data:ro \
  -v $(pwd)/backup:/backup \
  alpine \
  cp /data/database.sqlite /backup/database-$(date +%Y%m%d-%H%M%S).sqlite
```

### Restore

**1. Stop Depsera:**

```bash
# Docker Compose
docker compose down

# systemd
sudo systemctl stop depsera

# PM2
pm2 stop depsera
```

**2. Replace the database:**

```bash
# Bare Node.js
cp backup/database.sqlite server/data/database.sqlite

# Docker
docker run --rm \
  -v depsera-data:/data \
  -v $(pwd)/backup:/backup \
  alpine \
  cp /backup/database.sqlite /data/database.sqlite
```

**3. Restart Depsera:**

```bash
# Docker Compose
docker compose up -d

# systemd
sudo systemctl start depsera

# PM2
pm2 start depsera
```

### Automated Backups

**Cron job (Linux):**

```bash
# Add to crontab: daily backup at 1:00 AM (before the 2:00 AM retention cleanup)
0 1 * * * sqlite3 /opt/depsera/server/data/database.sqlite ".backup '/opt/depsera/backups/database-$(date +\%Y\%m\%d).sqlite'"

# Optional: delete backups older than 30 days
0 2 * * * find /opt/depsera/backups -name "*.sqlite" -mtime +30 -delete
```

**Docker cron job:**

```bash
# Daily backup of Docker volume
0 1 * * * docker run --rm -v depsera-data:/data:ro -v /opt/backups/depsera:/backup alpine cp /data/database.sqlite /backup/database-$(date +\%Y\%m\%d).sqlite
```

---

## Upgrading

**Docker Compose:**

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker compose up -d --build
```

**Bare Node.js:**

```bash
# Pull latest changes
git pull

# Install dependencies
npm run install:all

# Build
npm run build

# Restart
sudo systemctl restart depsera  # or pm2 restart depsera
```

Database migrations run automatically on startup, so no explicit migration step is needed.
