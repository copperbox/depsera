import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');

describe('OIDC manual testing infrastructure (PRO-103)', () => {
  let dockerComposeOidc: string;
  let realmExport: string;
  let keycloakGuide: string;
  let oktaGuide: string;

  beforeAll(() => {
    dockerComposeOidc = fs.readFileSync(
      path.join(repoRoot, 'docker-compose.oidc-test.yml'),
      'utf-8',
    );
    realmExport = fs.readFileSync(
      path.join(repoRoot, 'keycloak', 'depsera-test-realm.json'),
      'utf-8',
    );
    keycloakGuide = fs.readFileSync(
      path.join(repoRoot, 'docs', 'testing-with-keycloak.md'),
      'utf-8',
    );
    oktaGuide = fs.readFileSync(
      path.join(repoRoot, 'docs', 'testing-with-okta.md'),
      'utf-8',
    );
  });

  describe('docker-compose.oidc-test.yml', () => {
    it('exists and is readable', () => {
      expect(dockerComposeOidc).toBeTruthy();
    });

    it('defines a keycloak service', () => {
      expect(dockerComposeOidc).toMatch(/keycloak:/);
    });

    it('defines a depsera service', () => {
      expect(dockerComposeOidc).toMatch(/depsera:/);
    });

    it('uses the official Keycloak image', () => {
      expect(dockerComposeOidc).toMatch(/quay\.io\/keycloak\/keycloak/);
    });

    it('exposes Keycloak on port 8080', () => {
      expect(dockerComposeOidc).toMatch(/8080:8080/);
    });

    it('exposes Depsera on port 3001', () => {
      expect(dockerComposeOidc).toMatch(/3001:3001/);
    });

    it('configures Keycloak admin credentials', () => {
      expect(dockerComposeOidc).toContain('KEYCLOAK_ADMIN=admin');
      expect(dockerComposeOidc).toContain('KEYCLOAK_ADMIN_PASSWORD=admin');
    });

    it('imports the realm export file', () => {
      expect(dockerComposeOidc).toContain('--import-realm');
      expect(dockerComposeOidc).toContain('depsera-test-realm.json');
    });

    it('mounts the realm export as a volume', () => {
      expect(dockerComposeOidc).toMatch(
        /\.\/keycloak\/depsera-test-realm\.json/,
      );
    });

    it('configures OIDC env vars for Depsera', () => {
      expect(dockerComposeOidc).toContain('OIDC_ISSUER_URL=');
      expect(dockerComposeOidc).toContain('OIDC_CLIENT_ID=depsera');
      expect(dockerComposeOidc).toContain('OIDC_CLIENT_SECRET=');
      expect(dockerComposeOidc).toContain('OIDC_REDIRECT_URI=');
    });

    it('uses the Docker network hostname for OIDC issuer URL', () => {
      expect(dockerComposeOidc).toContain(
        'OIDC_ISSUER_URL=http://keycloak:8080/realms/depsera-test',
      );
    });

    it('configures Depsera to depend on Keycloak', () => {
      expect(dockerComposeOidc).toContain('depends_on');
      expect(dockerComposeOidc).toContain('keycloak');
    });

    it('waits for Keycloak health check', () => {
      expect(dockerComposeOidc).toContain('condition: service_healthy');
    });

    it('includes a Keycloak health check', () => {
      expect(dockerComposeOidc).toContain('healthcheck');
    });

    it('configures a session secret', () => {
      expect(dockerComposeOidc).toContain('SESSION_SECRET=');
    });

    it('does not set LOCAL_AUTH', () => {
      expect(dockerComposeOidc).not.toMatch(/LOCAL_AUTH\s*=\s*true/);
    });

    it('defines a data volume', () => {
      expect(dockerComposeOidc).toMatch(/volumes:/);
      expect(dockerComposeOidc).toContain('depsera-data');
    });
  });

  describe('Keycloak realm export', () => {
    let realm: Record<string, unknown>;

    beforeAll(() => {
      realm = JSON.parse(realmExport);
    });

    it('is valid JSON', () => {
      expect(realm).toBeTruthy();
    });

    it('defines the depsera-test realm', () => {
      expect(realm.realm).toBe('depsera-test');
    });

    it('realm is enabled', () => {
      expect(realm.enabled).toBe(true);
    });

    it('SSL is not required (for local testing)', () => {
      expect(realm.sslRequired).toBe('none');
    });

    describe('client configuration', () => {
      let client: Record<string, unknown>;

      beforeAll(() => {
        const clients = realm.clients as Record<string, unknown>[];
        client = clients.find(
          (c) => c.clientId === 'depsera',
        ) as Record<string, unknown>;
      });

      it('has a depsera client', () => {
        expect(client).toBeDefined();
      });

      it('client is enabled', () => {
        expect(client.enabled).toBe(true);
      });

      it('has a client secret', () => {
        expect(client.secret).toBeTruthy();
      });

      it('client secret matches docker-compose config', () => {
        expect(dockerComposeOidc).toContain(
          `OIDC_CLIENT_SECRET=${client.secret}`,
        );
      });

      it('configures the correct redirect URI', () => {
        const redirectUris = client.redirectUris as string[];
        expect(redirectUris).toContain(
          'http://localhost:3001/api/auth/callback',
        );
      });

      it('uses openid-connect protocol', () => {
        expect(client.protocol).toBe('openid-connect');
      });

      it('has standard flow enabled (authorization code)', () => {
        expect(client.standardFlowEnabled).toBe(true);
      });

      it('is not a public client (confidential)', () => {
        expect(client.publicClient).toBe(false);
      });

      it('requires PKCE S256', () => {
        const attributes = client.attributes as Record<string, string>;
        expect(attributes['pkce.code.challenge.method']).toBe('S256');
      });

      it('includes required OIDC scopes', () => {
        const scopes = client.defaultClientScopes as string[];
        expect(scopes).toContain('openid');
        expect(scopes).toContain('email');
        expect(scopes).toContain('profile');
      });
    });

    describe('test users', () => {
      let users: Record<string, unknown>[];

      beforeAll(() => {
        users = realm.users as Record<string, unknown>[];
      });

      it('has test users defined', () => {
        expect(users).toBeDefined();
        expect(users.length).toBeGreaterThanOrEqual(2);
      });

      it('has admin@test.com user', () => {
        const admin = users.find((u) => u.email === 'admin@test.com');
        expect(admin).toBeDefined();
        expect(admin!.enabled).toBe(true);
        expect(admin!.emailVerified).toBe(true);
      });

      it('has user@test.com user', () => {
        const user = users.find((u) => u.email === 'user@test.com');
        expect(user).toBeDefined();
        expect(user!.enabled).toBe(true);
        expect(user!.emailVerified).toBe(true);
      });

      it('users have credentials configured', () => {
        for (const user of users) {
          const creds = user.credentials as Record<string, unknown>[];
          expect(creds).toBeDefined();
          expect(creds.length).toBeGreaterThan(0);
          expect(creds[0].type).toBe('password');
          expect(creds[0].temporary).toBe(false);
        }
      });
    });
  });

  describe('docs/testing-with-keycloak.md', () => {
    it('exists and is non-empty', () => {
      expect(keycloakGuide.length).toBeGreaterThan(100);
    });

    it('has a title', () => {
      expect(keycloakGuide).toMatch(/^# Testing with Keycloak/m);
    });

    it('documents the docker compose command', () => {
      expect(keycloakGuide).toContain('docker-compose.oidc-test.yml');
      expect(keycloakGuide).toContain('docker compose');
    });

    it('documents the test user credentials', () => {
      expect(keycloakGuide).toContain('admin@test.com');
      expect(keycloakGuide).toContain('user@test.com');
      expect(keycloakGuide).toContain('admin123');
      expect(keycloakGuide).toContain('user123');
    });

    it('documents the Keycloak admin console', () => {
      expect(keycloakGuide).toContain('localhost:8080');
      expect(keycloakGuide).toMatch(/admin/i);
    });

    it('documents the OIDC env vars', () => {
      expect(keycloakGuide).toContain('OIDC_ISSUER_URL');
      expect(keycloakGuide).toContain('OIDC_CLIENT_ID');
      expect(keycloakGuide).toContain('OIDC_CLIENT_SECRET');
      expect(keycloakGuide).toContain('OIDC_REDIRECT_URI');
    });

    it('documents the realm configuration', () => {
      expect(keycloakGuide).toContain('depsera-test');
      expect(keycloakGuide).toContain('depsera-test-secret');
    });

    it('explains running Depsera outside Docker', () => {
      expect(keycloakGuide).toContain('npm run dev');
      expect(keycloakGuide).toContain('localhost:8080');
    });

    it('includes a troubleshooting section', () => {
      expect(keycloakGuide).toMatch(/## Troubleshooting/);
    });

    it('documents what to test', () => {
      expect(keycloakGuide).toMatch(/login/i);
      expect(keycloakGuide).toMatch(/logout/i);
    });

    it('explains the Docker network hostname vs localhost difference', () => {
      expect(keycloakGuide).toContain('keycloak:8080');
      expect(keycloakGuide).toContain('localhost:8080');
    });

    it('references the realm export file', () => {
      expect(keycloakGuide).toContain('depsera-test-realm.json');
    });
  });

  describe('docs/testing-with-okta.md', () => {
    it('exists and is non-empty', () => {
      expect(oktaGuide.length).toBeGreaterThan(100);
    });

    it('has a title', () => {
      expect(oktaGuide).toMatch(/^# Testing with Okta/m);
    });

    it('links to Okta developer signup', () => {
      expect(oktaGuide).toContain('developer.okta.com');
    });

    it('documents application registration steps', () => {
      expect(oktaGuide).toMatch(/OIDC.*OpenID Connect/i);
      expect(oktaGuide).toMatch(/Web Application/i);
      expect(oktaGuide).toContain('Authorization Code');
    });

    it('documents redirect URI configuration', () => {
      expect(oktaGuide).toContain(
        'http://localhost:3001/api/auth/callback',
      );
      expect(oktaGuide).toMatch(/redirect/i);
    });

    it('documents the required env vars', () => {
      expect(oktaGuide).toContain('OIDC_ISSUER_URL');
      expect(oktaGuide).toContain('OIDC_CLIENT_ID');
      expect(oktaGuide).toContain('OIDC_CLIENT_SECRET');
      expect(oktaGuide).toContain('OIDC_REDIRECT_URI');
    });

    it('documents the issuer URL pattern', () => {
      expect(oktaGuide).toMatch(/dev-.*\.okta\.com/);
    });

    it('mentions the discovery document URL', () => {
      expect(oktaGuide).toContain('.well-known/openid-configuration');
    });

    it('explains the expected login flow', () => {
      expect(oktaGuide).toMatch(/Sign in with SSO/i);
      expect(oktaGuide).toMatch(/redirect/i);
    });

    it('documents the expected server startup log', () => {
      expect(oktaGuide).toContain('Discovering OIDC issuer');
      expect(oktaGuide).toContain('OIDC issuer discovered');
    });

    it('explains first-user admin bootstrap', () => {
      expect(oktaGuide).toMatch(/first.*admin/i);
    });

    it('includes a troubleshooting section', () => {
      expect(oktaGuide).toMatch(/## Troubleshooting/);
    });

    it('troubleshoots redirect_uri mismatch', () => {
      expect(oktaGuide).toMatch(/redirect_uri/);
    });

    it('troubleshoots invalid client credentials', () => {
      expect(oktaGuide).toMatch(/client_id|client_secret/i);
    });

    it('explains how to add test users in Okta', () => {
      expect(oktaGuide).toMatch(/Add.*person|test user/i);
    });

    it('warns about LOCAL_AUTH mutual exclusion', () => {
      expect(oktaGuide).toContain('LOCAL_AUTH');
    });
  });

  describe('cross-file consistency', () => {
    it('docker-compose client ID matches realm export', () => {
      const realm = JSON.parse(realmExport);
      const clients = realm.clients as Record<string, unknown>[];
      const client = clients.find((c) => c.clientId === 'depsera');
      expect(client).toBeDefined();
      expect(dockerComposeOidc).toContain(
        `OIDC_CLIENT_ID=${client!.clientId}`,
      );
    });

    it('docker-compose client secret matches realm export', () => {
      const realm = JSON.parse(realmExport);
      const clients = realm.clients as Record<string, unknown>[];
      const client = clients.find((c) => c.clientId === 'depsera');
      expect(client).toBeDefined();
      expect(dockerComposeOidc).toContain(
        `OIDC_CLIENT_SECRET=${client!.secret}`,
      );
    });

    it('docker-compose issuer URL references the correct realm', () => {
      const realm = JSON.parse(realmExport);
      expect(dockerComposeOidc).toContain(
        `/realms/${realm.realm}`,
      );
    });

    it('Keycloak guide documents the same credentials as realm export', () => {
      const realm = JSON.parse(realmExport);
      const users = realm.users as Record<string, unknown>[];
      for (const user of users) {
        expect(keycloakGuide).toContain(user.email as string);
        const creds = user.credentials as Record<string, unknown>[];
        expect(keycloakGuide).toContain(creds[0].value as string);
      }
    });

    it('redirect URI is consistent across all files', () => {
      const expectedUri = 'http://localhost:3001/api/auth/callback';
      expect(dockerComposeOidc).toContain(expectedUri);
      expect(realmExport).toContain(expectedUri);
      expect(keycloakGuide).toContain(expectedUri);
      expect(oktaGuide).toContain(expectedUri);
    });
  });
});
