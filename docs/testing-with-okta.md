# Testing with Okta

This guide walks through configuring a free Okta developer account to test Depsera's OIDC integration against a production-grade identity provider.

## Prerequisites

- An Okta developer account (free at https://developer.okta.com/signup/)
- Depsera running locally (`npm run dev`) or via Docker

## Step 1: Create an Okta Developer Account

1. Go to https://developer.okta.com/signup/
2. Fill in the registration form
3. Verify your email and set a password
4. You'll be redirected to the Okta admin dashboard

Note your **Okta domain** — it looks like `https://dev-XXXXXXXX.okta.com`. This is your issuer URL base.

## Step 2: Register a Web Application

1. In the Okta admin dashboard, navigate to **Applications** > **Applications**
2. Click **Create App Integration**
3. Select:
   - **Sign-in method:** OIDC - OpenID Connect
   - **Application type:** Web Application
4. Click **Next**

### Configure the Application

| Field | Value |
|-------|-------|
| App integration name | `Depsera` |
| Grant type | Authorization Code (checked by default) |
| Sign-in redirect URIs | `http://localhost:3001/api/auth/callback` |
| Sign-out redirect URIs | `http://localhost:3001/login` |
| Controlled access | Skip group assignment for now / Allow everyone |

5. Click **Save**

### Collect Credentials

After saving, you'll see the application details page:

- **Client ID** — copy this value
- **Client Secret** — click **Show** and copy this value

## Step 3: Find Your Issuer URL

Your OIDC issuer URL follows the pattern:

```
https://dev-XXXXXXXX.okta.com
```

You can verify it works by opening the discovery document in your browser:

```
https://dev-XXXXXXXX.okta.com/.well-known/openid-configuration
```

This should return a JSON document with `issuer`, `authorization_endpoint`, `token_endpoint`, etc.

## Step 4: Configure Depsera

Create or update `server/.env` with your Okta credentials:

```env
OIDC_ISSUER_URL=https://dev-XXXXXXXX.okta.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=http://localhost:3001/api/auth/callback
SESSION_SECRET=dev-secret-change-in-production
```

Make sure `LOCAL_AUTH` is **not** set (or is set to `false`), since OIDC and local auth are mutually exclusive.

## Step 5: Start Depsera

```bash
npm run dev
```

The server should log:

```
Discovering OIDC issuer: https://dev-XXXXXXXX.okta.com
OIDC issuer discovered: https://dev-XXXXXXXX.okta.com
```

## Step 6: Test the Login Flow

### Login

1. Open http://localhost:3000 in your browser
2. Click **Sign in with SSO**
3. You'll be redirected to the Okta login page
4. Enter your Okta account credentials
5. After authentication, you'll be redirected back to Depsera
6. The first user to log in is bootstrapped as `admin`

### Logout

1. Click the user menu and select **Logout**
2. Your Depsera session is destroyed
3. Okta's end-session endpoint is called (you may see a brief redirect to Okta)
4. You're redirected to the Depsera login page

### Verify User Record

After logging in, check the user record in Depsera:

1. If you're admin, go to the Admin > Users page
2. Verify your email and name match your Okta profile
3. Verify your role is `admin` (if you were the first user)

## Adding Test Users in Okta

To test multi-user scenarios:

1. In the Okta admin dashboard, go to **Directory** > **People**
2. Click **Add person**
3. Fill in the details (set a password, uncheck "User must change password on first sign in")
4. Go to **Applications** > **Depsera** > **Assignments**
5. Click **Assign** > **Assign to People** and assign the new user

## Troubleshooting

### "OIDC_ISSUER_URL is required" error

Double-check your `.env` file:
- `OIDC_ISSUER_URL` must be set and non-empty
- `LOCAL_AUTH` must not be set to `true`

### "redirect_uri mismatch" error on Okta

The redirect URI configured in Okta must exactly match `OIDC_REDIRECT_URI` in your `.env`:
- Protocol: `http` vs `https`
- Host: `localhost` vs `127.0.0.1`
- Port: `3001`
- Path: `/api/auth/callback`

Go to **Applications** > **Depsera** > **General** > **Login** and verify the redirect URI.

### "Invalid client_id" or "Invalid client_secret" error

1. Go to **Applications** > **Depsera** > **General** in Okta
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

### Okta shows "application not assigned"

By default, Okta may require explicit user-to-app assignment. Go to **Applications** > **Depsera** > **Assignments** and assign the user, or change the application's **Controlled access** setting to **Allow everyone in your organization**.

### Session cookie not set after callback

If using HTTPS locally, make sure `TRUST_PROXY` and/or `REQUIRE_HTTPS` are configured correctly. The session cookie's `Secure` flag is derived from `req.secure`, which depends on the trust proxy configuration.
