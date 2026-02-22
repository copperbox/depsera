# Testing with Auth0

This guide walks through configuring a free Auth0 account to test Depsera's OIDC integration against a production-grade identity provider.

> **Note:** Okta retired its classic developer edition tenants in 2025 and now directs developers to Auth0. If you previously used an Okta `dev-XXXXXXXX.okta.com` tenant, those are no longer available. Auth0's free plan supports up to 25,000 monthly active users.

## Prerequisites

- An Auth0 account (free at https://auth0.com/signup)
- Depsera running locally (`npm run dev`) or via Docker

## Step 1: Create an Auth0 Account

1. Go to https://auth0.com/signup (or via https://developer.okta.com/signup/ and select **Auth0**)
2. Sign up with email, GitHub, Google, or Microsoft
3. Create a **tenant** — choose a name (lowercase, alphanumeric + hyphens) and a region (US, EU, AU, etc.)

Your tenant name and region determine your Auth0 domain. For example, a tenant named `my-app` in the US region gives you `my-app.us.auth0.com`.

## Step 2: Register a Web Application

1. In the Auth0 dashboard, navigate to **Applications** > **Applications**
2. Click **Create Application**
3. Enter the name `Depsera`
4. Select **Regular Web Applications**
5. Click **Create**

### Configure the Application

Go to the **Settings** tab and scroll to **Application URIs**:

| Field | Value |
|-------|-------|
| Allowed Callback URLs | `http://localhost:3001/api/auth/callback` |
| Allowed Logout URLs | `http://localhost:3000/login, http://localhost:3001/login` |
| Allowed Web Origins | `http://localhost:3000` |

Click **Save Changes** at the bottom of the page.

### Collect Credentials

In the **Settings** tab under **Basic Information**, copy these values:

- **Domain** — your Auth0 tenant domain (e.g., `my-app.us.auth0.com`)
- **Client ID** — alphanumeric identifier
- **Client Secret** — click **Reveal Client Secret** to show and copy

## Step 3: Find Your Issuer URL

Your OIDC issuer URL is your tenant domain with `https://`:

```
https://YOUR-TENANT.us.auth0.com
```

You can verify it works by opening the discovery document in your browser:

```
https://YOUR-TENANT.us.auth0.com/.well-known/openid-configuration
```

This should return a JSON document with `issuer`, `authorization_endpoint`, `token_endpoint`, etc.

## Step 4: Configure Depsera

Create or update `server/.env` with your Auth0 credentials:

```env
OIDC_ISSUER_URL=https://YOUR-TENANT.us.auth0.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=http://localhost:3001/api/auth/callback
SESSION_SECRET=dev-secret-change-in-production
```

Make sure `LOCAL_AUTH` is **not** set (or is set to `false`), since OIDC and local auth are mutually exclusive.

> Replace `us` with your region code if you chose a different region (e.g., `eu`, `au`, `uk`, `ca`, `jp`).

## Step 5: Start Depsera

```bash
npm run dev
```

The server should log:

```
Discovering OIDC issuer: https://YOUR-TENANT.us.auth0.com
OIDC issuer discovered: https://YOUR-TENANT.us.auth0.com
```

## Step 6: Test the Login Flow

### Login

1. Open http://localhost:3000 in your browser
2. Click **Sign in with SSO**
3. You'll be redirected to the Auth0 Universal Login page
4. Enter your Auth0 account credentials
5. After authentication, you'll be redirected back to Depsera
6. The first user to log in is bootstrapped as `admin`

### Logout

1. Click the user menu and select **Logout**
2. Your Depsera session is destroyed
3. Auth0's end-session endpoint is called (you may see a brief redirect to Auth0)
4. You're redirected to the Depsera login page

### Verify User Record

After logging in, check the user record in Depsera:

1. If you're admin, go to the Admin > Users page
2. Verify your email and name match your Auth0 profile
3. Verify your role is `admin` (if you were the first user)

## Adding Test Users

To test multi-user scenarios:

1. In the Auth0 dashboard, go to **User Management** > **Users**
2. Click **Create User**
3. Select the **Username-Password-Authentication** connection
4. Enter an email and password
5. Click **Create**

Make sure the `Username-Password-Authentication` connection is enabled for your application under **Applications** > **Depsera** > **Connections**.

## Troubleshooting

### "OIDC_ISSUER_URL is required" error

Double-check your `.env` file:
- `OIDC_ISSUER_URL` must be set and non-empty
- `LOCAL_AUTH` must not be set to `true`

### "redirect_uri mismatch" error

The callback URL configured in Auth0 must exactly match `OIDC_REDIRECT_URI` in your `.env`:
- Protocol: `http` vs `https`
- Host: `localhost` vs `127.0.0.1`
- Port: `3001`
- Path: `/api/auth/callback`

Go to **Applications** > **Depsera** > **Settings** > **Application URIs** and verify the Allowed Callback URL.

### "Invalid client_id" or "Invalid client_secret" error

1. Go to **Applications** > **Depsera** > **Settings** in Auth0
2. Re-copy the Client ID and Client Secret
3. Make sure there are no extra spaces or quotes in your `.env` file

### Login works but user has wrong role

Depsera assigns the `admin` role to the very first user who logs in. All subsequent users get the `user` role. To reset:
1. Delete `server/data/database.sqlite`
2. Restart Depsera
3. Log in with the account you want to be admin first

### CORS errors in browser console

Check that `CORS_ORIGIN` in your `.env` matches the URL you're accessing Depsera from:
- Dev mode: `CORS_ORIGIN=http://localhost:3000`
- Production/Docker: `CORS_ORIGIN=http://localhost:3001`

Also verify that `http://localhost:3000` is listed in **Allowed Web Origins** in Auth0.

### Session cookie not set after callback

If using HTTPS locally, make sure `TRUST_PROXY` and/or `REQUIRE_HTTPS` are configured correctly. The session cookie's `Secure` flag is derived from `req.secure`, which depends on the trust proxy configuration.
