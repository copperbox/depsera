import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const docsDir = path.join(repoRoot, 'docs');

describe('Admin guide documentation', () => {
  let adminGuide: string;

  beforeAll(() => {
    adminGuide = fs.readFileSync(path.join(docsDir, 'admin-guide.md'), 'utf-8');
  });

  describe('file exists', () => {
    it('admin-guide.md exists in docs/', () => {
      expect(fs.existsSync(path.join(docsDir, 'admin-guide.md'))).toBe(true);
    });
  });

  describe('required sections', () => {
    const requiredSections = [
      'First-Run Setup',
      'User Management',
      'Team Management',
      'Alert Configuration',
      'Admin Settings',
      'SSRF Allowlist',
      'Data Retention and Cleanup',
      'Audit Log',
      'Monitoring and Observability',
      'Troubleshooting',
    ];

    it.each(requiredSections)('has section for %s', (section) => {
      expect(adminGuide).toContain(`## ${section}`);
    });
  });

  describe('first-run setup', () => {
    it('documents local auth mode setup', () => {
      expect(adminGuide).toContain('### Local Auth Mode');
      expect(adminGuide).toContain('LOCAL_AUTH=true');
      expect(adminGuide).toContain('ADMIN_EMAIL');
      expect(adminGuide).toContain('ADMIN_PASSWORD');
    });

    it('documents OIDC mode setup', () => {
      expect(adminGuide).toContain('### OIDC Mode');
      expect(adminGuide).toContain('OIDC_ISSUER_URL');
      expect(adminGuide).toContain('OIDC_CLIENT_ID');
      expect(adminGuide).toContain('OIDC_CLIENT_SECRET');
      expect(adminGuide).toContain('OIDC_REDIRECT_URI');
    });

    it('documents first-user admin bootstrap for both modes', () => {
      expect(adminGuide).toContain('first user to log in is automatically bootstrapped as admin');
      expect(adminGuide).toContain('creates the initial admin account');
    });

    it('documents SESSION_SECRET requirement', () => {
      expect(adminGuide).toContain('SESSION_SECRET');
    });

    it('documents auth mode check endpoint', () => {
      expect(adminGuide).toContain('/api/auth/mode');
    });

    it('documents OIDC scopes', () => {
      expect(adminGuide).toContain('openid email profile');
    });

    it('documents PKCE', () => {
      expect(adminGuide).toContain('PKCE');
    });
  });

  describe('user management', () => {
    it('documents user roles', () => {
      expect(adminGuide).toContain('### User Roles');
      expect(adminGuide).toContain('admin');
      expect(adminGuide).toContain('user');
    });

    it('documents creating users in local auth mode', () => {
      expect(adminGuide).toContain('### Creating Users (Local Auth)');
      expect(adminGuide).toContain('/admin/users');
    });

    it('documents password reset in local auth mode', () => {
      expect(adminGuide).toContain('### Resetting Passwords (Local Auth)');
    });

    it('documents role changes', () => {
      expect(adminGuide).toContain('### Changing User Roles');
    });

    it('documents deactivation and reactivation', () => {
      expect(adminGuide).toContain('### Deactivating and Reactivating Users');
    });

    it('documents last admin protection constraint', () => {
      expect(adminGuide).toMatch(/cannot demote the last active admin/i);
      expect(adminGuide).toMatch(/cannot deactivate the last active admin/i);
    });

    it('documents password requirements', () => {
      expect(adminGuide).toContain('8 characters');
    });

    it('notes local auth only restriction', () => {
      expect(adminGuide).toMatch(/only available in local auth mode/i);
    });
  });

  describe('team management', () => {
    it('documents team member roles', () => {
      expect(adminGuide).toContain('### Team Member Roles');
      expect(adminGuide).toContain('lead');
      expect(adminGuide).toContain('member');
    });

    it('documents creating teams', () => {
      expect(adminGuide).toContain('### Creating Teams');
    });

    it('documents managing members', () => {
      expect(adminGuide).toContain('### Managing Members');
    });

    it('documents team-scoped access', () => {
      expect(adminGuide).toContain('### Team-Scoped Access');
    });

    it('documents org-wide views exception', () => {
      expect(adminGuide).toMatch(/graph.*wallboard.*dashboard/i);
    });
  });

  describe('alert configuration', () => {
    it('documents alert channels section', () => {
      expect(adminGuide).toContain('### Alert Channels');
    });

    it('documents Slack channel setup', () => {
      expect(adminGuide).toContain('Slack');
      expect(adminGuide).toContain('hooks.slack.com');
    });

    it('documents generic webhook setup', () => {
      expect(adminGuide).toContain('Webhook');
      expect(adminGuide).toContain('custom headers');
    });

    it('documents webhook payload format', () => {
      expect(adminGuide).toContain('dependency_status_change');
      expect(adminGuide).toContain('oldStatus');
      expect(adminGuide).toContain('newStatus');
      expect(adminGuide).toContain('severity');
    });

    it('documents alert rules', () => {
      expect(adminGuide).toContain('### Alert Rules');
      expect(adminGuide).toContain('Critical only');
      expect(adminGuide).toContain('Warning and above');
      expect(adminGuide).toContain('All status changes');
    });

    it('documents alert history', () => {
      expect(adminGuide).toContain('### Alert History');
      expect(adminGuide).toContain('sent');
      expect(adminGuide).toContain('failed');
      expect(adminGuide).toContain('suppressed');
    });

    it('documents flap protection', () => {
      expect(adminGuide).toContain('### Flap Protection and Rate Limiting');
      expect(adminGuide).toContain('5 minutes');
    });

    it('documents per-team rate limiting', () => {
      expect(adminGuide).toContain('30');
      expect(adminGuide).toContain('per hour');
    });

    it('documents test channel feature', () => {
      expect(adminGuide).toContain('Test');
    });

    it('documents APP_BASE_URL for deep links', () => {
      expect(adminGuide).toContain('APP_BASE_URL');
    });

    it('documents webhook HTTP methods', () => {
      expect(adminGuide).toContain('POST');
      expect(adminGuide).toContain('PUT');
      expect(adminGuide).toContain('PATCH');
    });
  });

  describe('admin settings', () => {
    it('documents settings page location', () => {
      expect(adminGuide).toContain('/admin/settings');
    });

    it('documents immediate effect', () => {
      expect(adminGuide).toMatch(/take effect immediately/i);
    });

    it('documents env var override behavior', () => {
      expect(adminGuide).toMatch(/database value takes precedence/i);
    });

    describe('settings sections', () => {
      it('has data retention section', () => {
        expect(adminGuide).toContain('### Data Retention');
      });

      it('has polling defaults section', () => {
        expect(adminGuide).toContain('### Polling Defaults');
      });

      it('has security section', () => {
        expect(adminGuide).toContain('### Security');
      });

      it('has alerts section', () => {
        expect(adminGuide).toContain('### Alerts');
      });
    });

    describe('settings values match SettingsService', () => {
      it('documents data retention days range', () => {
        expect(adminGuide).toContain('1–3,650');
        expect(adminGuide).toContain('365');
      });

      it('documents cleanup time default', () => {
        expect(adminGuide).toContain('02:00');
      });

      it('documents poll interval range', () => {
        expect(adminGuide).toContain('5,000–3,600,000');
        expect(adminGuide).toContain('30,000');
      });

      it('documents global rate limit range', () => {
        expect(adminGuide).toContain('1–10,000');
      });

      it('documents auth rate limit range', () => {
        expect(adminGuide).toContain('1–1,000');
      });

      it('documents alert cooldown range', () => {
        expect(adminGuide).toContain('0–1,440');
      });

      it('documents alert rate limit default', () => {
        expect(adminGuide).toContain('1–1,000');
      });
    });
  });

  describe('SSRF allowlist', () => {
    it('documents entry types', () => {
      expect(adminGuide).toContain('Exact hostnames');
      expect(adminGuide).toContain('Wildcard patterns');
      expect(adminGuide).toContain('CIDR ranges');
    });

    it('documents common blocked ranges', () => {
      expect(adminGuide).toContain('127.0.0.0/8');
      expect(adminGuide).toContain('10.0.0.0/8');
      expect(adminGuide).toContain('172.16.0.0/12');
      expect(adminGuide).toContain('192.168.0.0/16');
      expect(adminGuide).toContain('169.254.0.0/16');
    });

    it('documents SSRF_ALLOWLIST env var', () => {
      expect(adminGuide).toContain('SSRF_ALLOWLIST');
    });

    it('documents two-stage validation', () => {
      expect(adminGuide).toContain('Two-stage validation');
      expect(adminGuide).toContain('DNS rebinding');
    });

    it('provides a configuration example', () => {
      expect(adminGuide).toMatch(/SSRF_ALLOWLIST=.*\*.internal/);
    });
  });

  describe('data retention and cleanup', () => {
    it('documents tables cleaned', () => {
      expect(adminGuide).toContain('dependency_latency_history');
      expect(adminGuide).toContain('dependency_error_history');
      expect(adminGuide).toContain('audit_log');
      expect(adminGuide).toContain('alert_history');
    });

    it('documents schedule behavior', () => {
      expect(adminGuide).toContain('once daily');
      expect(adminGuide).toContain('60 seconds');
    });

    it('documents startup catch-up', () => {
      expect(adminGuide).toMatch(/server was down.*cleanup runs/i);
    });

    it('documents configuration env vars', () => {
      expect(adminGuide).toContain('DATA_RETENTION_DAYS');
      expect(adminGuide).toContain('RETENTION_CLEANUP_TIME');
    });
  });

  describe('audit log', () => {
    it('documents audited actions', () => {
      expect(adminGuide).toContain('User creation');
      expect(adminGuide).toContain('deactivation');
      expect(adminGuide).toContain('reactivation');
      expect(adminGuide).toContain('role changes');
      expect(adminGuide).toContain('Team creation');
      expect(adminGuide).toContain('Service creation');
      expect(adminGuide).toContain('Admin settings changes');
    });

    it('documents audit log API endpoint', () => {
      expect(adminGuide).toContain('/api/admin/audit-log');
    });

    it('documents query parameters', () => {
      expect(adminGuide).toContain('startDate');
      expect(adminGuide).toContain('endDate');
      expect(adminGuide).toContain('action');
      expect(adminGuide).toContain('resourceType');
    });

    it('documents curl examples', () => {
      expect(adminGuide).toContain('curl');
    });

    it('documents data retention applicability', () => {
      expect(adminGuide).toMatch(/audit log.*subject to data retention/i);
    });
  });

  describe('monitoring and observability', () => {
    it('documents health endpoint', () => {
      expect(adminGuide).toContain('### Health Endpoint');
      expect(adminGuide).toContain('/api/health');
      expect(adminGuide).toContain('"status": "ok"');
    });

    it('notes health endpoint is unauthenticated', () => {
      expect(adminGuide).toMatch(/no authentication required/i);
    });

    it('notes health endpoint is not rate-limited', () => {
      expect(adminGuide).toMatch(/not rate-limited/i);
    });

    it('documents logging', () => {
      expect(adminGuide).toContain('### Logging');
      expect(adminGuide).toContain('LOG_LEVEL');
      expect(adminGuide).toContain('Pino');
    });

    it('documents log levels', () => {
      expect(adminGuide).toContain('trace');
      expect(adminGuide).toContain('debug');
      expect(adminGuide).toContain('info');
      expect(adminGuide).toContain('warn');
      expect(adminGuide).toContain('error');
      expect(adminGuide).toContain('fatal');
      expect(adminGuide).toContain('silent');
    });

    it('documents JSON vs pretty-printed format', () => {
      expect(adminGuide).toContain('JSON');
      expect(adminGuide).toContain('Pretty-printed');
    });

    it('documents sensitive header redaction', () => {
      expect(adminGuide).toContain('Authorization');
      expect(adminGuide).toContain('Cookie');
      expect(adminGuide).toContain('X-CSRF-Token');
    });

    it('documents polling health monitoring', () => {
      expect(adminGuide).toContain('### Polling Health');
    });

    it('documents circuit breaker behavior', () => {
      expect(adminGuide).toContain('10 consecutive');
      expect(adminGuide).toContain('5 minutes');
    });

    it('documents exponential backoff', () => {
      expect(adminGuide).toContain('Exponential backoff');
    });

    it('documents host concurrency limit', () => {
      expect(adminGuide).toContain('POLL_MAX_CONCURRENT_PER_HOST');
      expect(adminGuide).toContain('5 concurrent');
    });

    it('documents poll deduplication', () => {
      expect(adminGuide).toContain('deduplication');
    });
  });

  describe('troubleshooting', () => {
    const troubleshootingTopics = [
      'Server won\'t start',
      'Login issues',
      'Services not polling',
      'Alerts not sending',
      'Performance',
      'Permission errors',
    ];

    it.each(troubleshootingTopics)('has troubleshooting section for "%s"', (topic) => {
      expect(adminGuide).toContain(topic);
    });

    it('covers SESSION_SECRET errors', () => {
      expect(adminGuide).toContain('SESSION_SECRET is required in production');
      expect(adminGuide).toContain('SESSION_SECRET is too weak');
    });

    it('covers OIDC login troubleshooting', () => {
      expect(adminGuide).toContain('OIDC_REDIRECT_URI');
    });

    it('covers SSRF blocking troubleshooting', () => {
      expect(adminGuide).toContain('SSRF blocked');
    });

    it('covers circuit breaker troubleshooting', () => {
      expect(adminGuide).toContain('circuit open');
    });

    it('covers suppressed alerts troubleshooting', () => {
      expect(adminGuide).toContain('Suppressed');
    });

    it('covers 403 permission errors', () => {
      expect(adminGuide).toContain('403');
    });

    it('covers 404 on local-auth-only endpoints', () => {
      expect(adminGuide).toContain('404');
      expect(adminGuide).toContain('not 403');
    });
  });

  describe('cross-references', () => {
    it('links to installation guide', () => {
      expect(adminGuide).toContain('installation.md');
    });

    it('has a table of contents', () => {
      expect(adminGuide).toContain('## Table of Contents');
    });
  });

  describe('accuracy against codebase', () => {
    let rateLimitMiddleware: string;
    let settingsService: string;
    let retentionService: string;

    beforeAll(() => {
      rateLimitMiddleware = fs.readFileSync(
        path.join(repoRoot, 'server', 'src', 'middleware', 'rateLimit.ts'),
        'utf-8'
      );
      settingsService = fs.readFileSync(
        path.join(repoRoot, 'server', 'src', 'services', 'settings', 'SettingsService.ts'),
        'utf-8'
      );
      retentionService = fs.readFileSync(
        path.join(repoRoot, 'server', 'src', 'services', 'retention', 'DataRetentionService.ts'),
        'utf-8'
      );
    });

    it('global rate limit default matches code', () => {
      const match = rateLimitMiddleware.match(/RATE_LIMIT_MAX.*'(\d+)'/);
      expect(match).not.toBeNull();
      const codeDefault = match![1];
      // Doc may format with commas (e.g. 3000 → 3,000)
      const formatted = Number(codeDefault).toLocaleString('en-US');
      expect(adminGuide).toContain(formatted);
    });

    it('auth rate limit default matches code', () => {
      const match = rateLimitMiddleware.match(/AUTH_RATE_LIMIT_MAX.*'(\d+)'/);
      expect(match).not.toBeNull();
      const codeDefault = match![1];
      expect(adminGuide).toContain(codeDefault);
    });

    it('retention check interval documented correctly', () => {
      expect(retentionService).toContain('60_000');
      expect(adminGuide).toContain('60 seconds');
    });

    it('settings validation ranges documented', () => {
      // data_retention_days: 1-3650
      expect(settingsService).toContain('3650');
      expect(adminGuide).toContain('3,650');

      // global_rate_limit: 1-10000
      expect(settingsService).toContain('10000');
      expect(adminGuide).toContain('10,000');

      // alert_cooldown_minutes: 0-1440
      expect(settingsService).toContain('1440');
      expect(adminGuide).toContain('1,440');
    });
  });
});
