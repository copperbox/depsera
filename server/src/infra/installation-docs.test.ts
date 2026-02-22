import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const docsDir = path.join(repoRoot, 'docs');

describe('Installation documentation', () => {
  let installationDoc: string;
  let envExample: string;
  let dockerfile: string;
  let dockerCompose: string;
  let packageJson: Record<string, unknown>;
  let serverPackageJson: Record<string, unknown>;

  beforeAll(() => {
    installationDoc = fs.readFileSync(path.join(docsDir, 'installation.md'), 'utf-8');
    envExample = fs.readFileSync(path.join(repoRoot, 'server', '.env.example'), 'utf-8');
    dockerfile = fs.readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf-8');
    dockerCompose = fs.readFileSync(path.join(repoRoot, 'docker-compose.yml'), 'utf-8');
    packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));
    serverPackageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'server', 'package.json'), 'utf-8'));
  });

  describe('file exists', () => {
    it('installation.md exists in docs/', () => {
      expect(fs.existsSync(path.join(docsDir, 'installation.md'))).toBe(true);
    });
  });

  describe('required sections', () => {
    it('has Docker Compose quick start', () => {
      expect(installationDoc).toContain('## Quick Start (Docker Compose)');
    });

    it('has Docker section', () => {
      expect(installationDoc).toContain('## Docker');
    });

    it('has bare Node.js section', () => {
      expect(installationDoc).toContain('## Bare Node.js');
    });

    it('has reverse proxy section', () => {
      expect(installationDoc).toContain('## Reverse Proxy');
    });

    it('has nginx example', () => {
      expect(installationDoc).toContain('### nginx');
      expect(installationDoc).toContain('proxy_pass');
    });

    it('has Caddy example', () => {
      expect(installationDoc).toContain('### Caddy');
      expect(installationDoc).toContain('reverse_proxy');
    });

    it('has configuration reference', () => {
      expect(installationDoc).toContain('## Configuration Reference');
    });

    it('has production checklist', () => {
      expect(installationDoc).toContain('## Production Checklist');
    });

    it('has backup and restore section', () => {
      expect(installationDoc).toContain('## Backup and Restore');
    });

    it('has upgrading section', () => {
      expect(installationDoc).toContain('## Upgrading');
    });
  });

  describe('env var documentation matches .env.example', () => {
    const envVarsInExample = [
      'PORT',
      'DATABASE_PATH',
      'LOCAL_AUTH',
      'ADMIN_EMAIL',
      'ADMIN_PASSWORD',
      'OIDC_ISSUER_URL',
      'OIDC_CLIENT_ID',
      'OIDC_CLIENT_SECRET',
      'OIDC_REDIRECT_URI',
      'SESSION_SECRET',
      'CORS_ORIGIN',
      'SSRF_ALLOWLIST',
      'TRUST_PROXY',
      'REQUIRE_HTTPS',
      'RATE_LIMIT_WINDOW_MS',
      'RATE_LIMIT_MAX',
      'AUTH_RATE_LIMIT_WINDOW_MS',
      'AUTH_RATE_LIMIT_MAX',
      'LOG_LEVEL',
      'DATA_RETENTION_DAYS',
      'RETENTION_CLEANUP_TIME',
      'POLL_MAX_CONCURRENT_PER_HOST',
      'APP_BASE_URL',
    ];

    it.each(envVarsInExample)('documents env var %s', (envVar) => {
      expect(installationDoc).toContain(`\`${envVar}\``);
    });
  });

  describe('admin settings documentation matches SettingsService', () => {
    const adminSettingsKeys = [
      'data_retention_days',
      'retention_cleanup_time',
      'default_poll_interval_ms',
      'ssrf_allowlist',
      'global_rate_limit',
      'global_rate_limit_window_minutes',
      'auth_rate_limit',
      'auth_rate_limit_window_minutes',
      'alert_cooldown_minutes',
      'alert_rate_limit_per_hour',
    ];

    it.each(adminSettingsKeys)('documents admin setting %s', (key) => {
      expect(installationDoc).toContain(`\`${key}\``);
    });
  });

  describe('Docker documentation accuracy', () => {
    it('documents the correct port from Dockerfile', () => {
      expect(dockerfile).toContain('EXPOSE 3001');
      expect(installationDoc).toContain('3001:3001');
    });

    it('documents the correct volume path', () => {
      expect(dockerfile).toMatch(/VOLUME.*\/app\/server\/data/);
      expect(installationDoc).toContain('/app/server/data');
    });

    it('documents the health check endpoint', () => {
      expect(dockerfile).toContain('/api/health');
      expect(installationDoc).toContain('/api/health');
    });

    it('documents docker compose up command', () => {
      expect(installationDoc).toContain('docker compose up -d');
    });

    it('documents docker compose down command', () => {
      expect(installationDoc).toContain('docker compose down');
    });
  });

  describe('build commands match package.json', () => {
    it('documents install:all script', () => {
      const scripts = packageJson.scripts as Record<string, string>;
      expect(scripts['install:all']).toBeDefined();
      expect(installationDoc).toContain('npm run install:all');
    });

    it('documents build script', () => {
      const scripts = packageJson.scripts as Record<string, string>;
      expect(scripts.build).toBeDefined();
      expect(installationDoc).toContain('npm run build');
    });

    it('documents server start script', () => {
      const scripts = serverPackageJson.scripts as Record<string, string>;
      expect(scripts.start).toBeDefined();
      expect(installationDoc).toContain('npm start');
    });

    it('documents db:migrate script', () => {
      const scripts = serverPackageJson.scripts as Record<string, string>;
      expect(scripts['db:migrate']).toBeDefined();
      expect(installationDoc).toContain('npm run db:migrate');
    });
  });

  describe('reverse proxy documentation', () => {
    it('mentions TRUST_PROXY requirement', () => {
      expect(installationDoc).toContain('TRUST_PROXY');
      // Must mention it's required behind a proxy
      expect(installationDoc).toMatch(/TRUST_PROXY.*required|required.*TRUST_PROXY/i);
    });

    it('mentions REQUIRE_HTTPS', () => {
      expect(installationDoc).toContain('REQUIRE_HTTPS');
    });

    it('nginx example includes X-Forwarded-Proto', () => {
      expect(installationDoc).toContain('X-Forwarded-Proto');
    });

    it('nginx example includes SSL configuration', () => {
      expect(installationDoc).toContain('ssl_certificate');
    });
  });

  describe('production checklist', () => {
    it('includes SESSION_SECRET requirement', () => {
      expect(installationDoc).toContain('SESSION_SECRET');
      expect(installationDoc).toContain('32 characters');
    });

    it('includes NODE_ENV=production', () => {
      expect(installationDoc).toContain('NODE_ENV=production');
    });

    it('includes secret generation command', () => {
      expect(installationDoc).toContain("require('crypto').randomBytes");
    });
  });

  describe('backup documentation', () => {
    it('mentions SQLite database file', () => {
      expect(installationDoc).toContain('database.sqlite');
    });

    it('mentions WAL mode', () => {
      expect(installationDoc).toContain('WAL');
    });

    it('documents sqlite3 backup command', () => {
      expect(installationDoc).toContain('sqlite3');
      expect(installationDoc).toContain('.backup');
    });

    it('documents Docker volume backup method', () => {
      expect(installationDoc).toContain('depsera-data');
    });

    it('includes restore procedure', () => {
      expect(installationDoc).toContain('### Restore');
    });

    it('includes automated backup example', () => {
      expect(installationDoc).toContain('### Automated Backups');
      expect(installationDoc).toContain('cron');
    });
  });

  describe('authentication documentation', () => {
    it('documents both auth modes', () => {
      expect(installationDoc).toContain('LOCAL_AUTH');
      expect(installationDoc).toContain('OIDC');
    });

    it('mentions mutual exclusion', () => {
      expect(installationDoc).toMatch(/mutually exclusive/i);
    });

    it('documents first user admin bootstrap', () => {
      expect(installationDoc).toContain('bootstrapped as admin');
    });
  });
});
