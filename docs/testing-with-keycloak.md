# Testing with Keycloak

This guide explains how to run Depsera with a local Keycloak OIDC provider for manual testing of the full SSO login flow.

> **Note:** Automated OIDC integration tests use an in-process `oidc-provider` (see `server/src/__tests__/integration/oidc.test.ts`). This Keycloak setup is for visual/manual validation against a real enterprise-grade identity provider.

## Prerequisites

- Docker and Docker Compose installed
- Depsera repository cloned

## Quick Start

### 1. Start the Stack

```bash
docker compose -f docker-compose.oidc-test.yml up -d
```

This starts two services:

| Service | URL | Description |
|---------|-----|-------------|
| Keycloak | http://localhost:8080 | OIDC identity provider |
| Depsera | http://localhost:3001 | Application (waits for Keycloak to be healthy) |

Keycloak takes about 30-60 seconds to start on the first run. Depsera will wait automatically.

### 2. Log In to Depsera

1. Open http://localhost:3001 in your browser
2. Click **Sign in with SSO**
3. You'll be redirected to the Keycloak login page
4. Enter one of the test user credentials (see below)
5. After authentication, you'll be redirected back to Depsera

### 3. Test User Accounts

| Email | Password | Notes |
|-------|----------|-------|
| `admin@test.com` | `admin123` | First user to log in becomes Depsera admin |
| `user@test.com` | `user123` | Subsequent users get `user` role |

### 4. Stop the Stack

```bash
docker compose -f docker-compose.oidc-test.yml down
```

To also remove the data volume:

```bash
docker compose -f docker-compose.oidc-test.yml down -v
```

## Keycloak Admin Console

Access the Keycloak admin console to inspect or modify the OIDC configuration:

1. Open http://localhost:8080/admin
2. Log in with `admin` / `admin`
3. Select the **depsera-test** realm from the dropdown

### Pre-configured Realm

The realm export (`keycloak/depsera-test-realm.json`) includes:

- **Realm:** `depsera-test`
- **Client:** `depsera`
  - Client ID: `depsera`
  - Client secret: `depsera-test-secret`
  - Redirect URI: `http://localhost:3001/api/auth/callback`
  - PKCE: S256 required
  - Grant type: Authorization Code
- **Users:** `admin@test.com` and `user@test.com` with known passwords

## Environment Variables

The `docker-compose.oidc-test.yml` configures Depsera with these OIDC variables:

| Variable | Value |
|----------|-------|
| `OIDC_ISSUER_URL` | `http://keycloak:8080/realms/depsera-test` |
| `OIDC_CLIENT_ID` | `depsera` |
| `OIDC_CLIENT_SECRET` | `depsera-test-secret` |
| `OIDC_REDIRECT_URI` | `http://localhost:3001/api/auth/callback` |

> **Note:** `OIDC_ISSUER_URL` uses the Docker network hostname `keycloak` (not `localhost`) because the Depsera container discovers OIDC metadata server-to-server. The browser-facing redirect goes through `localhost:8080`.

## Running Depsera Outside Docker

If you want to run Depsera locally (via `npm run dev`) against the Keycloak container:

### 1. Start Only Keycloak

```bash
docker compose -f docker-compose.oidc-test.yml up keycloak -d
```

### 2. Configure Environment

Create or update `server/.env`:

```env
OIDC_ISSUER_URL=http://localhost:8080/realms/depsera-test
OIDC_CLIENT_ID=depsera
OIDC_CLIENT_SECRET=depsera-test-secret
OIDC_REDIRECT_URI=http://localhost:3001/api/auth/callback
SESSION_SECRET=dev-secret-change-in-production
```

> **Note:** When running outside Docker, use `localhost:8080` for `OIDC_ISSUER_URL` since the server can reach Keycloak directly on the host network.

### 3. Start Depsera

```bash
npm run dev
```

## What to Test

### Login Flow

1. Navigate to http://localhost:3001 (or http://localhost:3000 if running dev mode)
2. Click **Sign in with SSO** — should redirect to Keycloak
3. Enter credentials — should redirect back to Depsera with an active session
4. Verify user appears in the Depsera admin panel with correct email and name

### Logout Flow

1. Click the user menu and select **Logout**
2. Should destroy the Depsera session
3. Keycloak end-session endpoint should be called (if supported)
4. Navigating back to Depsera should require re-authentication

### First-User Admin Bootstrap

1. Start with a fresh database (delete `server/data/database.sqlite` or `docker compose down -v`)
2. Log in with `admin@test.com` — should be assigned the `admin` role
3. Log in with `user@test.com` — should be assigned the `user` role

### User Profile Sync

1. Log in to Keycloak admin console
2. Edit a test user's name or email
3. Log in to Depsera with that user
4. Verify the updated claims are reflected in Depsera

## Troubleshooting

### Keycloak is slow to start

Keycloak can take 30-60 seconds on first startup. The Depsera container waits for Keycloak's health check before starting. Check the logs:

```bash
docker compose -f docker-compose.oidc-test.yml logs keycloak
```

### "OIDC_ISSUER_URL is required" error

Make sure Keycloak is fully started and healthy. Depsera discovers the OIDC configuration from the issuer URL on startup:

```bash
docker compose -f docker-compose.oidc-test.yml ps
```

The Keycloak service should show `healthy` status.

### Login redirects fail

Check that the redirect URI matches exactly. Keycloak is strict about redirect URIs — the configured URI must match `OIDC_REDIRECT_URI` exactly, including protocol, host, port, and path.

### Cookie/session issues

If you see session-related errors, clear your browser cookies for `localhost:3001` and try again. In the Docker setup, `SESSION_SECRET` is pre-configured.

### Port conflicts

If port 8080 or 3001 is already in use, stop the conflicting services or modify the port mappings in `docker-compose.oidc-test.yml`.
