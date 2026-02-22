/**
 * Test helper for creating an in-process OIDC provider using `oidc-provider`.
 *
 * Provides:
 * - `createTestProvider()` — starts an oidc-provider on a random port
 * - `completeOIDCLogin()` — programmatically completes the devInteractions login/consent flow
 * - `CookieJar` — simple cookie manager for tracking cookies across HTTP requests
 */

import http from 'http';

// eslint-disable-next-line @typescript-eslint/no-var-requires, security/detect-non-literal-require
const Provider = require('oidc-provider');

export interface TestAccount {
  id: string;
  email: string;
  name: string;
}

export interface TestProviderOptions {
  callbackUri: string;
  accounts?: TestAccount[];
}

export interface TestProviderResult {
  url: string;
  server: http.Server;
  accounts: TestAccount[];
}

const DEFAULT_ACCOUNTS: TestAccount[] = [
  { id: 'alice', email: 'alice@test.com', name: 'Alice Test' },
  { id: 'bob', email: 'bob@test.com', name: 'Bob Test' },
];

/**
 * Simple cookie jar for tracking HTTP cookies across requests.
 */
export class CookieJar {
  private cookies = new Map<string, string>();

  update(response: Response): void {
    const setCookies = response.headers.getSetCookie?.() || [];
    for (const cookie of setCookies) {
      const nameValue = cookie.split(';')[0];
      const eqIndex = nameValue.indexOf('=');
      if (eqIndex < 0) continue;
      const name = nameValue.substring(0, eqIndex).trim();
      const value = nameValue.substring(eqIndex + 1).trim();
      this.cookies.set(name, value);
    }
  }

  toString(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  has(name: string): boolean {
    return this.cookies.has(name);
  }

  clear(): void {
    this.cookies.clear();
  }
}

/**
 * Finds a free port by briefly listening on port 0.
 */
async function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

/**
 * Creates and starts an in-process OIDC provider for integration testing.
 *
 * The provider is configured with:
 * - A test client (`test-client` / `test-secret`)
 * - PKCE S256 required
 * - devInteractions enabled (provides login/consent forms)
 * - Configurable test accounts via `findAccount`
 */
export async function createTestProvider(
  options: TestProviderOptions,
): Promise<TestProviderResult> {
  const port = await getRandomPort();
  const providerUrl = `http://localhost:${port}`;
  const accounts = options.accounts || DEFAULT_ACCOUNTS;

  // Mutable accounts map — tests can update claims between logins
  const accountsMap = new Map<string, TestAccount>();
  for (const account of accounts) {
    accountsMap.set(account.id, account);
  }

  const provider = new Provider(providerUrl, {
    clients: [
      {
        client_id: 'test-client',
        client_secret: 'test-secret',
        redirect_uris: [options.callbackUri],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_post',
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findAccount: async (_ctx: any, id: string) => {
      const account = accountsMap.get(id);
      return {
        accountId: id,
        claims: async () => ({
          sub: id,
          email: account?.email || `${id}@test.com`,
          name: account?.name || `User ${id}`,
        }),
      };
    },
    features: {
      devInteractions: { enabled: true },
    },
    pkce: {
      methods: ['S256'],
      required: () => true,
    },
    scopes: ['openid', 'email', 'profile'],
    claims: {
      openid: ['sub'],
      email: ['email'],
      profile: ['name'],
    },
  });

  const server: http.Server = provider.listen(port);

  return {
    url: providerUrl,
    server,
    accounts,
  };
}

/**
 * Programmatically completes the OIDC login flow through the provider's devInteractions.
 *
 * Follows the redirect chain:
 * 1. Auth endpoint → interaction (login form)
 * 2. POST login → resume auth
 * 3. Auth → interaction (consent form)
 * 4. POST consent → resume auth
 * 5. Auth → callback URL with code + state
 *
 * @returns The final callback URL containing the authorization code and state
 */
export async function completeOIDCLogin(
  providerBaseUrl: string,
  authorizationUrl: string,
  accountId: string,
): Promise<string> {
  const jar = new CookieJar();

  function resolveUrl(location: string): string {
    return location.startsWith('http') ? location : `${providerBaseUrl}${location}`;
  }

  async function makeRequest(
    url: string,
    options: RequestInit = {},
  ): Promise<{ response: Response; location: string | null }> {
    const response = await fetch(url, {
      ...options,
      redirect: 'manual',
      headers: {
        ...((options.headers as Record<string, string>) || {}),
        Cookie: jar.toString(),
      },
    });
    jar.update(response);
    return { response, location: response.headers.get('location') };
  }

  // Helper: check if a redirect points back to the callback (error or success)
  function isCallbackRedirect(location: string): boolean {
    return location.startsWith('http') && !location.startsWith(providerBaseUrl);
  }

  // Step 1: Hit the authorization endpoint
  const step1 = await makeRequest(authorizationUrl);
  if (!step1.location) {
    throw new Error(`Auth endpoint did not redirect. Status: ${step1.response.status}`);
  }

  // If the provider redirected straight to the callback (e.g., error), return it
  if (isCallbackRedirect(step1.location)) {
    return step1.location;
  }

  // Step 2: GET the interaction page to find the form action
  const interactionUrl = resolveUrl(step1.location);
  const step2 = await makeRequest(interactionUrl);
  const html = await step2.response.text();
  const formMatch = html.match(/action="([^"]+)"/);
  const loginPostUrl = formMatch ? resolveUrl(formMatch[1]) : interactionUrl;

  // Step 3: POST login
  const step3 = await makeRequest(loginPostUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `prompt=login&login=${encodeURIComponent(accountId)}&password=test`,
  });
  if (!step3.location) {
    throw new Error(`Login POST did not redirect. Status: ${step3.response.status}`);
  }

  // Step 4: Follow redirect back to auth (resume after login)
  const step4 = await makeRequest(resolveUrl(step3.location));
  if (!step4.location) {
    throw new Error(`Auth resume did not redirect. Status: ${step4.response.status}`);
  }

  // Check if we're already at the callback (no consent needed)
  const step4Loc = step4.location;
  if (!step4Loc.includes('/interaction/')) {
    return resolveUrl(step4Loc);
  }

  // Step 5: GET consent page
  const consentUrl = resolveUrl(step4Loc);
  const step5 = await makeRequest(consentUrl);
  const consentHtml = await step5.response.text();
  const consentFormMatch = consentHtml.match(/action="([^"]+)"/);
  const consentPostUrl = consentFormMatch ? resolveUrl(consentFormMatch[1]) : consentUrl;

  // Step 6: POST consent
  const step6 = await makeRequest(consentPostUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'prompt=consent',
  });
  if (!step6.location) {
    throw new Error(`Consent POST did not redirect. Status: ${step6.response.status}`);
  }

  // Step 7: Follow redirect back to auth (resume after consent)
  const step7 = await makeRequest(resolveUrl(step6.location));
  if (!step7.location) {
    throw new Error(`Final auth resume did not redirect. Status: ${step7.response.status}`);
  }

  // This should be the callback URL
  return resolveUrl(step7.location);
}
