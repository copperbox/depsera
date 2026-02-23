import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const docsDir = path.join(repoRoot, 'docs');

describe('API reference documentation', () => {
  let apiDoc: string;
  beforeAll(() => {
    apiDoc = fs.readFileSync(path.join(docsDir, 'api-reference.md'), 'utf-8');
  });

  describe('api-reference.md exists and has required sections', () => {
    it('file exists', () => {
      expect(fs.existsSync(path.join(docsDir, 'api-reference.md'))).toBe(true);
    });

    const requiredSections = [
      'Health Check',
      'Auth',
      'Services',
      'Teams',
      'Users',
      'Aliases',
      'Associations',
      'Graph',
      'History',
      'Admin',
      'Alerts',
    ];

    it.each(requiredSections)('has section for %s', (section) => {
      expect(apiDoc).toContain(`## ${section}`);
    });
  });

  describe('api-reference.md documents all endpoints', () => {
    const endpoints = [
      // Health
      'GET /api/health',
      // Auth
      'GET /api/auth/mode',
      'GET /api/auth/login',
      'GET /api/auth/callback',
      'POST /api/auth/login',
      'POST /api/auth/logout',
      'GET /api/auth/me',
      // Services
      'GET /api/services',
      'GET /api/services/:id',
      'POST /api/services',
      'PUT /api/services/:id',
      'DELETE /api/services/:id',
      'POST /api/services/:id/poll',
      'POST /api/services/test-schema',
      // Teams
      'GET /api/teams',
      'GET /api/teams/:id',
      'POST /api/teams',
      'PUT /api/teams/:id',
      'DELETE /api/teams/:id',
      'POST /api/teams/:id/members',
      'PUT /api/teams/:id/members/:userId',
      'DELETE /api/teams/:id/members/:userId',
      // Users
      'GET /api/users',
      'GET /api/users/:id',
      'POST /api/users',
      'PUT /api/users/:id/role',
      'PUT /api/users/:id/password',
      'DELETE /api/users/:id',
      'POST /api/users/:id/reactivate',
      // Aliases
      'GET /api/aliases',
      'GET /api/aliases/canonical-names',
      'POST /api/aliases',
      'PUT /api/aliases/:id',
      'DELETE /api/aliases/:id',
      // Associations
      'GET /api/dependencies/:dependencyId/associations',
      'POST /api/dependencies/:dependencyId/associations',
      'DELETE /api/dependencies/:dependencyId/associations/:serviceId',
      'GET /api/associations/suggestions',
      // Graph
      'GET /api/graph',
      // History
      'GET /api/latency/:dependencyId',
      'GET /api/latency/:dependencyId/buckets',
      'GET /api/errors/:dependencyId',
      'GET /api/dependencies/:id/timeline',
      // Admin
      'GET /api/admin/audit-log',
      'GET /api/admin/settings',
      'PUT /api/admin/settings',
      // Alerts
      'GET /api/teams/:id/alert-channels',
      'POST /api/teams/:id/alert-channels',
      'PUT /api/teams/:id/alert-channels/:channelId',
      'DELETE /api/teams/:id/alert-channels/:channelId',
      'GET /api/teams/:id/alert-rules',
      'PUT /api/teams/:id/alert-rules',
      'GET /api/teams/:id/alert-history',
    ];

    it.each(endpoints)('documents endpoint %s', (endpoint) => {
      // Match the endpoint path in a heading or code block
      const endpointPath = endpoint.replace(/^(GET|POST|PUT|DELETE|PATCH)\s+/, '');
      expect(apiDoc).toContain(endpointPath);
    });
  });

  describe('api-reference.md includes curl examples', () => {
    it('has curl examples', () => {
      const curlCount = (apiDoc.match(/```bash\n.*curl/g) || []).length;
      expect(curlCount).toBeGreaterThanOrEqual(10);
    });

    it('has JSON response examples', () => {
      const jsonCount = (apiDoc.match(/```json/g) || []).length;
      expect(jsonCount).toBeGreaterThanOrEqual(10);
    });
  });

  describe('api-reference.md documents auth requirements', () => {
    it('mentions CSRF token requirement', () => {
      expect(apiDoc).toContain('X-CSRF-Token');
    });

    it('mentions session cookie', () => {
      expect(apiDoc).toContain('deps-dashboard.sid');
    });

    it('documents common error status codes', () => {
      expect(apiDoc).toContain('401');
      expect(apiDoc).toContain('403');
      expect(apiDoc).toContain('404');
      expect(apiDoc).toContain('429');
    });

    it('mentions admin role requirement', () => {
      expect(apiDoc).toContain('admin role');
    });

    it('mentions team lead requirement', () => {
      expect(apiDoc).toContain('team lead');
    });
  });

  describe('api-reference.md documents request/response shapes', () => {
    it('documents service create request fields', () => {
      expect(apiDoc).toContain('health_endpoint');
      expect(apiDoc).toContain('poll_interval_ms');
      expect(apiDoc).toContain('schema_config');
    });

    it('documents auth/me response shape', () => {
      expect(apiDoc).toContain('canManageUsers');
      expect(apiDoc).toContain('canManageTeams');
      expect(apiDoc).toContain('canManageServices');
    });

    it('documents latency bucket response shape', () => {
      expect(apiDoc).toContain('"min"');
      expect(apiDoc).toContain('"avg"');
      expect(apiDoc).toContain('"max"');
      expect(apiDoc).toContain('"count"');
    });

    it('documents alert channel types', () => {
      expect(apiDoc).toContain('slack');
      expect(apiDoc).toContain('webhook');
    });

    it('documents severity filter values', () => {
      expect(apiDoc).toContain('"critical"');
      expect(apiDoc).toContain('"warning"');
      expect(apiDoc).toContain('"all"');
    });

    it('documents audit action types', () => {
      expect(apiDoc).toContain('user.role_changed');
      expect(apiDoc).toContain('service.created');
      expect(apiDoc).toContain('settings.updated');
    });
  });
});

describe('README.md overhaul', () => {
  let readme: string;

  beforeAll(() => {
    readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf-8');
  });

  describe('positioning', () => {
    it('does not contain early stages warning', () => {
      expect(readme).not.toContain('early stages of development');
    });

    it('does not contain not ready for production', () => {
      expect(readme).not.toContain('not ready for production');
    });
  });

  describe('badges', () => {
    it('has version badge', () => {
      expect(readme).toMatch(/\[!\[Version\]/);
    });

    it('has license badge', () => {
      expect(readme).toMatch(/\[!\[License/);
    });
  });

  describe('architecture', () => {
    it('has architecture section', () => {
      expect(readme).toContain('## Architecture');
    });

    it('has architecture diagram', () => {
      expect(readme).toContain('Express Server');
      expect(readme).toContain('SQLite Database');
      expect(readme).toContain('Browser');
    });

    it('describes monorepo layout', () => {
      expect(readme).toContain('client/');
      expect(readme).toContain('server/');
    });
  });

  describe('quick start', () => {
    it('has quick start section at the top', () => {
      expect(readme).toContain('## Quick Start');
    });

    it('includes docker compose command', () => {
      expect(readme).toContain('docker compose up -d');
    });
  });

  describe('features section', () => {
    it('has features section', () => {
      expect(readme).toContain('## Features');
    });

    const featureCategories = [
      'Health Monitoring',
      'Visualization',
      'Team Management',
      'Alerting',
      'Security',
      'Operations',
    ];

    it.each(featureCategories)('covers %s', (category) => {
      expect(readme).toContain(category);
    });
  });

  describe('pages table', () => {
    it('has pages section', () => {
      expect(readme).toContain('## Pages');
    });

    const pages = [
      '/services',
      '/teams',
      '/graph',
      '/associations',
      '/wallboard',
      '/admin/users',
      '/admin/settings',
    ];

    it.each(pages)('documents page %s', (page) => {
      expect(readme).toContain(page);
    });
  });

  describe('API section links to full reference', () => {
    it('has API section', () => {
      expect(readme).toContain('## API');
    });

    it('links to api-reference.md', () => {
      expect(readme).toContain('docs/api-reference.md');
    });
  });

  describe('documentation section', () => {
    it('has documentation section', () => {
      expect(readme).toContain('## Documentation');
    });

    it('links to installation guide', () => {
      expect(readme).toContain('docs/installation.md');
    });

    it('links to API reference', () => {
      expect(readme).toContain('docs/api-reference.md');
    });
  });

  describe('configuration tables', () => {
    const coreEnvVars = [
      'PORT',
      'DATABASE_PATH',
      'SESSION_SECRET',
      'LOCAL_AUTH',
      'OIDC_ISSUER_URL',
      'SSRF_ALLOWLIST',
      'TRUST_PROXY',
      'LOG_LEVEL',
      'DATA_RETENTION_DAYS',
      'APP_BASE_URL',
    ];

    it.each(coreEnvVars)('documents env var %s', (envVar) => {
      expect(readme).toContain(`\`${envVar}\``);
    });
  });
});

describe('CLAUDE.md updates', () => {
  let claudeMd: string;

  beforeAll(() => {
    claudeMd = fs.readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf-8');
  });

  it('reflects 1.0 status', () => {
    expect(claudeMd).toMatch(/v?1\.0/);
  });

  it('has documentation section', () => {
    expect(claudeMd).toContain('## Documentation');
  });

  it('references api-reference.md', () => {
    expect(claudeMd).toContain('api-reference.md');
  });

  it('references installation.md', () => {
    expect(claudeMd).toContain('installation.md');
  });

  it('references spec directory', () => {
    expect(claudeMd).toContain('docs/spec/');
  });

  it('references implementation plan', () => {
    expect(claudeMd).toContain('implementation-plan.md');
  });

  it('documents all store registry entries', () => {
    const stores = [
      'services', 'teams', 'users', 'dependencies', 'associations',
      'latencyHistory', 'errorHistory', 'aliases', 'auditLog', 'settings',
      'alertChannels', 'alertRules', 'alertHistory',
    ];
    stores.forEach((store) => {
      expect(claudeMd).toContain(store);
    });
  });

  it('documents all API route groups', () => {
    const routeGroups = [
      '/api/auth',
      '/api/services',
      '/api/teams',
      '/api/users',
      '/api/aliases',
      '/api/graph',
      '/api/latency',
      '/api/errors',
      '/api/admin/audit-log',
      '/api/admin/settings',
      '/api/teams/:id/alert-channels',
      '/api/teams/:id/alert-rules',
      '/api/teams/:id/alert-history',
    ];
    routeGroups.forEach((route) => {
      expect(claudeMd).toContain(route);
    });
  });
});
