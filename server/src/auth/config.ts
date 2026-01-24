import * as client from 'openid-client';

let oidcConfig: client.Configuration | null = null;

export async function initializeOIDC(): Promise<void> {
  if (oidcConfig) return;

  const issuerUrl = process.env.OIDC_ISSUER_URL;
  if (!issuerUrl) {
    throw new Error('OIDC_ISSUER_URL is required when AUTH_BYPASS is not enabled');
  }

  const clientId = process.env.OIDC_CLIENT_ID;
  if (!clientId) {
    throw new Error('OIDC_CLIENT_ID is required');
  }

  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  if (!clientSecret) {
    throw new Error('OIDC_CLIENT_SECRET is required');
  }

  console.log(`Discovering OIDC issuer: ${issuerUrl}`);

  oidcConfig = await client.discovery(
    new URL(issuerUrl),
    clientId,
    clientSecret
  );

  console.log(`OIDC issuer discovered: ${oidcConfig.serverMetadata().issuer}`);
}

export function getOIDCConfig(): client.Configuration {
  if (!oidcConfig) {
    throw new Error('OIDC not initialized. Call initializeOIDC() first.');
  }
  return oidcConfig;
}

export function generateCodeVerifier(): string {
  return client.randomPKCECodeVerifier();
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  return client.calculatePKCECodeChallenge(verifier);
}

export function generateState(): string {
  return client.randomState();
}

export { client };
