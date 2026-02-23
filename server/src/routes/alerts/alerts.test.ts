import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

interface TestUser {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  oidc_subject: string | null;
  password_hash: string | null;
}

const adminUser: TestUser = {
  id: 'admin-1',
  email: 'admin@test.com',
  name: 'Admin User',
  role: 'admin',
  is_active: 1,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  oidc_subject: null,
  password_hash: null,
};

const leadUser: TestUser = {
  id: 'lead-1',
  email: 'lead@test.com',
  name: 'Lead User',
  role: 'user',
  is_active: 1,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  oidc_subject: null,
  password_hash: null,
};

const memberUser: TestUser = {
  id: 'member-1',
  email: 'member@test.com',
  name: 'Member User',
  role: 'user',
  is_active: 1,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  oidc_subject: null,
  password_hash: null,
};

const nonMemberUser: TestUser = {
  id: 'nonmember-1',
  email: 'nonmember@test.com',
  name: 'Non-Member',
  role: 'user',
  is_active: 1,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  oidc_subject: null,
  password_hash: null,
};

// Track the current user for auth mocking
let currentUser: TestUser = adminUser;

jest.mock('../../auth', () => ({
  requireAuth: jest.fn((req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.user = currentUser;
    req.session = { userId: currentUser.id };
    next();
  }),
  requireTeamAccess: jest.fn((req: Record<string, unknown>, res: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
    req.user = currentUser;
    req.session = { userId: currentUser.id };

    if (currentUser.role === 'admin') {
      next();
      return;
    }

    const teamId = (req.params as Record<string, string>).id;
    const membership = testDb.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, currentUser.id);
    if (!membership) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    next();
  }),
  requireTeamLead: jest.fn((req: Record<string, unknown>, res: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
    req.user = currentUser;
    req.session = { userId: currentUser.id };

    if (currentUser.role === 'admin') {
      next();
      return;
    }

    const teamId = (req.params as Record<string, string>).id;
    const membership = testDb.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, currentUser.id) as { role: string } | undefined;
    if (!membership || membership.role !== 'lead') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    next();
  }),
}));

// Mock AlertService for test channel endpoint
const mockSendTestAlert = jest.fn();
jest.mock('../../services/alerts', () => ({
  AlertService: {
    getInstance: () => ({
      sendTestAlert: mockSendTestAlert,
    }),
  },
}));

import alertsRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/teams', alertsRouter);

describe('Alert API Routes', () => {
  const teamId = 'team-1';
  const otherTeamId = 'team-2';

  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT,
        oidc_subject TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE team_members (
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (team_id, user_id),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        health_endpoint TEXT NOT NULL,
        metrics_endpoint TEXT,
        schema_config TEXT,
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_external INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        last_poll_success INTEGER,
        last_poll_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT
      );

      CREATE TABLE dependencies (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        name TEXT NOT NULL,
        canonical_name TEXT,
        description TEXT,
        impact TEXT,
        type TEXT DEFAULT 'other',
        healthy INTEGER,
        health_state INTEGER,
        health_code INTEGER,
        latency_ms INTEGER,
        check_details TEXT,
        error TEXT,
        error_message TEXT,
        last_checked TEXT,
        last_status_change TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(service_id, name),
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
      );

      CREATE TABLE alert_channels (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        channel_type TEXT NOT NULL CHECK(channel_type IN ('slack', 'webhook')),
        config TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_alert_channels_team_id ON alert_channels(team_id);

      CREATE TABLE alert_rules (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        severity_filter TEXT NOT NULL CHECK(severity_filter IN ('critical', 'warning', 'all')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_alert_rules_team_id ON alert_rules(team_id);

      CREATE TABLE alert_history (
        id TEXT PRIMARY KEY,
        alert_channel_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        dependency_id TEXT,
        event_type TEXT NOT NULL,
        payload TEXT,
        sent_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'suppressed')),
        FOREIGN KEY (alert_channel_id) REFERENCES alert_channels(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE SET NULL
      );
      CREATE INDEX idx_alert_history_channel_id ON alert_history(alert_channel_id);
      CREATE INDEX idx_alert_history_sent_at ON alert_history(sent_at);

      INSERT INTO users (id, email, name, role) VALUES
        ('admin-1', 'admin@test.com', 'Admin User', 'admin'),
        ('lead-1', 'lead@test.com', 'Lead User', 'user'),
        ('member-1', 'member@test.com', 'Member User', 'user'),
        ('nonmember-1', 'nonmember@test.com', 'Non-Member', 'user');

      INSERT INTO teams (id, name) VALUES
        ('team-1', 'Alpha Team'),
        ('team-2', 'Beta Team');

      INSERT INTO team_members (team_id, user_id, role) VALUES
        ('team-1', 'lead-1', 'lead'),
        ('team-1', 'member-1', 'member');

      INSERT INTO services (id, name, team_id, health_endpoint) VALUES
        ('service-1', 'Service One', 'team-1', 'https://svc1.example.com/health');
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM alert_history');
    testDb.exec('DELETE FROM alert_rules');
    testDb.exec('DELETE FROM alert_channels');
    currentUser = adminUser;
    mockSendTestAlert.mockReset();
  });

  // ─── Alert Channels ────────────────────────────────────────────

  describe('GET /api/teams/:id/alert-channels', () => {
    it('should return empty array when no channels exist', async () => {
      const res = await request(app).get(`/api/teams/${teamId}/alert-channels`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should return channels for the team', async () => {
      testDb.exec(`
        INSERT INTO alert_channels (id, team_id, channel_type, config)
        VALUES ('ch-1', 'team-1', 'slack', '{"webhook_url":"https://hooks.slack.com/services/test"}')
      `);

      const res = await request(app).get(`/api/teams/${teamId}/alert-channels`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('ch-1');
      expect(res.body[0].channel_type).toBe('slack');
    });

    it('should allow team members to list channels', async () => {
      currentUser = memberUser;
      const res = await request(app).get(`/api/teams/${teamId}/alert-channels`);
      expect(res.status).toBe(200);
    });

    it('should deny non-members access', async () => {
      currentUser = nonMemberUser;
      const res = await request(app).get(`/api/teams/${teamId}/alert-channels`);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/teams/:id/alert-channels', () => {
    it('should create a Slack channel', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-channels`)
        .send({
          channel_type: 'slack',
          config: { webhook_url: 'https://hooks.slack.com/services/T00/B00/xxx' },
        });

      expect(res.status).toBe(201);
      expect(res.body.channel_type).toBe('slack');
      expect(res.body.team_id).toBe(teamId);
      expect(res.body.is_active).toBe(1);
      expect(JSON.parse(res.body.config)).toEqual({ webhook_url: 'https://hooks.slack.com/services/T00/B00/xxx' });
    });

    it('should auto-create a default alert rule when team has none', async () => {
      // Verify no rules exist before
      const rulesBefore = testDb.prepare('SELECT * FROM alert_rules WHERE team_id = ?').all(teamId);
      expect(rulesBefore).toHaveLength(0);

      await request(app)
        .post(`/api/teams/${teamId}/alert-channels`)
        .send({
          channel_type: 'webhook',
          config: { url: 'https://example.com/hook' },
        });

      // Verify a default rule was auto-created
      const rulesAfter = testDb.prepare('SELECT * FROM alert_rules WHERE team_id = ?').all(teamId) as Array<{ severity_filter: string; is_active: number }>;
      expect(rulesAfter).toHaveLength(1);
      expect(rulesAfter[0].severity_filter).toBe('all');
      expect(rulesAfter[0].is_active).toBe(1);
    });

    it('should not create duplicate rule when team already has one', async () => {
      // Create a rule first
      testDb.exec(`INSERT INTO alert_rules (id, team_id, severity_filter) VALUES ('existing-rule', '${teamId}', 'critical')`);

      await request(app)
        .post(`/api/teams/${teamId}/alert-channels`)
        .send({
          channel_type: 'webhook',
          config: { url: 'https://example.com/hook' },
        });

      // Should still have just the one rule
      const rules = testDb.prepare('SELECT * FROM alert_rules WHERE team_id = ?').all(teamId) as Array<{ id: string; severity_filter: string }>;
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('existing-rule');
      expect(rules[0].severity_filter).toBe('critical');
    });

    it('should create a webhook channel', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-channels`)
        .send({
          channel_type: 'webhook',
          config: {
            url: 'https://example.com/webhook',
            headers: { Authorization: 'Bearer token123' },
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.channel_type).toBe('webhook');
      const config = JSON.parse(res.body.config);
      expect(config.url).toBe('https://example.com/webhook');
      expect(config.headers.Authorization).toBe('Bearer token123');
    });

    it('should reject invalid channel_type', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-channels`)
        .send({
          channel_type: 'email',
          config: { to: 'test@test.com' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('channel_type');
    });

    it('should reject missing config', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-channels`)
        .send({ channel_type: 'slack' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('config');
    });

    it('should reject invalid Slack webhook URL', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-channels`)
        .send({
          channel_type: 'slack',
          config: { webhook_url: 'https://not-slack.com/webhook' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Slack webhook URL');
    });

    it('should reject Slack channel without webhook_url', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-channels`)
        .send({
          channel_type: 'slack',
          config: {},
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('webhook_url');
    });

    it('should reject webhook channel without url', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-channels`)
        .send({
          channel_type: 'webhook',
          config: {},
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('url');
    });

    it('should reject webhook channel with invalid url', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-channels`)
        .send({
          channel_type: 'webhook',
          config: { url: 'not-a-url' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('valid URL');
    });

    it('should reject webhook channel with non-string headers', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-channels`)
        .send({
          channel_type: 'webhook',
          config: { url: 'https://example.com/hook', headers: { num: 123 } },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('string');
    });

    it('should allow team leads to create channels', async () => {
      currentUser = leadUser;
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-channels`)
        .send({
          channel_type: 'slack',
          config: { webhook_url: 'https://hooks.slack.com/services/T00/B00/lead' },
        });

      expect(res.status).toBe(201);
    });

    it('should deny members from creating channels', async () => {
      currentUser = memberUser;
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-channels`)
        .send({
          channel_type: 'slack',
          config: { webhook_url: 'https://hooks.slack.com/services/T00/B00/xxx' },
        });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/teams/:id/alert-channels/:channelId', () => {
    let channelId: string;

    beforeEach(() => {
      testDb.prepare(`
        INSERT INTO alert_channels (id, team_id, channel_type, config)
        VALUES ('ch-update', 'team-1', 'slack', '{"webhook_url":"https://hooks.slack.com/services/T00/B00/old"}')
      `).run();
      channelId = 'ch-update';
    });

    it('should update channel config', async () => {
      const res = await request(app)
        .put(`/api/teams/${teamId}/alert-channels/${channelId}`)
        .send({
          config: { webhook_url: 'https://hooks.slack.com/services/T00/B00/new' },
        });

      expect(res.status).toBe(200);
      expect(JSON.parse(res.body.config).webhook_url).toBe('https://hooks.slack.com/services/T00/B00/new');
    });

    it('should update is_active', async () => {
      const res = await request(app)
        .put(`/api/teams/${teamId}/alert-channels/${channelId}`)
        .send({ is_active: false });

      expect(res.status).toBe(200);
      expect(res.body.is_active).toBe(0);
    });

    it('should return 404 for non-existent channel', async () => {
      const res = await request(app)
        .put(`/api/teams/${teamId}/alert-channels/nonexistent`)
        .send({ is_active: false });

      expect(res.status).toBe(404);
    });

    it('should return 404 for channel belonging to another team', async () => {
      testDb.exec(`
        INSERT INTO alert_channels (id, team_id, channel_type, config)
        VALUES ('ch-other', 'team-2', 'webhook', '{"url":"https://example.com"}')
      `);

      const res = await request(app)
        .put(`/api/teams/${teamId}/alert-channels/ch-other`)
        .send({ is_active: false });

      expect(res.status).toBe(404);
    });

    it('should reject empty update', async () => {
      const res = await request(app)
        .put(`/api/teams/${teamId}/alert-channels/${channelId}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/teams/:id/alert-channels/:channelId', () => {
    it('should delete a channel', async () => {
      testDb.exec(`
        INSERT INTO alert_channels (id, team_id, channel_type, config)
        VALUES ('ch-del', 'team-1', 'slack', '{"webhook_url":"https://hooks.slack.com/services/T/B/x"}')
      `);

      const res = await request(app)
        .delete(`/api/teams/${teamId}/alert-channels/ch-del`);

      expect(res.status).toBe(204);

      // Verify deleted
      const row = testDb.prepare('SELECT * FROM alert_channels WHERE id = ?').get('ch-del');
      expect(row).toBeUndefined();
    });

    it('should return 404 for non-existent channel', async () => {
      const res = await request(app)
        .delete(`/api/teams/${teamId}/alert-channels/nonexistent`);

      expect(res.status).toBe(404);
    });

    it('should return 404 for channel belonging to another team', async () => {
      testDb.exec(`
        INSERT INTO alert_channels (id, team_id, channel_type, config)
        VALUES ('ch-other2', 'team-2', 'webhook', '{"url":"https://example.com"}')
      `);

      const res = await request(app)
        .delete(`/api/teams/${teamId}/alert-channels/ch-other2`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/teams/:id/alert-channels/:channelId/test', () => {
    beforeEach(() => {
      testDb.exec(`
        INSERT INTO alert_channels (id, team_id, channel_type, config)
        VALUES ('ch-test', 'team-1', 'slack', '{"webhook_url":"https://hooks.slack.com/services/T/B/test"}')
      `);
    });

    it('should send a test alert successfully', async () => {
      mockSendTestAlert.mockResolvedValue({ success: true });

      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-channels/ch-test/test`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.error).toBeNull();
      expect(mockSendTestAlert).toHaveBeenCalledWith('slack', '{"webhook_url":"https://hooks.slack.com/services/T/B/test"}');
    });

    it('should return failure from test alert', async () => {
      mockSendTestAlert.mockResolvedValue({ success: false, error: 'Connection failed' });

      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-channels/ch-test/test`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Connection failed');
    });

    it('should return 404 for non-existent channel', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-channels/nonexistent/test`);

      expect(res.status).toBe(404);
    });

    it('should return 404 for channel belonging to another team', async () => {
      testDb.exec(`
        INSERT INTO alert_channels (id, team_id, channel_type, config)
        VALUES ('ch-test-other', 'team-2', 'webhook', '{"url":"https://example.com"}')
      `);

      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-channels/ch-test-other/test`);

      expect(res.status).toBe(404);
    });
  });

  // ─── Alert Rules ────────────────────────────────────────────

  describe('GET /api/teams/:id/alert-rules', () => {
    it('should return empty array when no rules exist', async () => {
      const res = await request(app).get(`/api/teams/${teamId}/alert-rules`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should return rules for the team', async () => {
      testDb.exec(`
        INSERT INTO alert_rules (id, team_id, severity_filter)
        VALUES ('rule-1', 'team-1', 'critical')
      `);

      const res = await request(app).get(`/api/teams/${teamId}/alert-rules`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].severity_filter).toBe('critical');
    });

    it('should allow team members to list rules', async () => {
      currentUser = memberUser;
      const res = await request(app).get(`/api/teams/${teamId}/alert-rules`);
      expect(res.status).toBe(200);
    });

    it('should deny non-members access', async () => {
      currentUser = nonMemberUser;
      const res = await request(app).get(`/api/teams/${teamId}/alert-rules`);
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/teams/:id/alert-rules', () => {
    it('should create a new rule when none exists', async () => {
      const res = await request(app)
        .put(`/api/teams/${teamId}/alert-rules`)
        .send({ severity_filter: 'critical' });

      expect(res.status).toBe(200);
      expect(res.body.severity_filter).toBe('critical');
      expect(res.body.team_id).toBe(teamId);
      expect(res.body.is_active).toBe(1);
    });

    it('should update existing rule', async () => {
      // Create initial rule
      testDb.exec(`
        INSERT INTO alert_rules (id, team_id, severity_filter)
        VALUES ('rule-exist', 'team-1', 'critical')
      `);

      const res = await request(app)
        .put(`/api/teams/${teamId}/alert-rules`)
        .send({ severity_filter: 'all', is_active: false });

      expect(res.status).toBe(200);
      expect(res.body.severity_filter).toBe('all');
      expect(res.body.is_active).toBe(0);
    });

    it('should reject invalid severity_filter', async () => {
      const res = await request(app)
        .put(`/api/teams/${teamId}/alert-rules`)
        .send({ severity_filter: 'info' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('severity_filter');
    });

    it('should reject missing severity_filter', async () => {
      const res = await request(app)
        .put(`/api/teams/${teamId}/alert-rules`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should allow team leads to update rules', async () => {
      currentUser = leadUser;
      const res = await request(app)
        .put(`/api/teams/${teamId}/alert-rules`)
        .send({ severity_filter: 'warning' });

      expect(res.status).toBe(200);
    });

    it('should deny members from updating rules', async () => {
      currentUser = memberUser;
      const res = await request(app)
        .put(`/api/teams/${teamId}/alert-rules`)
        .send({ severity_filter: 'warning' });

      expect(res.status).toBe(403);
    });

    it('should default is_active to true when creating', async () => {
      const res = await request(app)
        .put(`/api/teams/${teamId}/alert-rules`)
        .send({ severity_filter: 'all' });

      expect(res.status).toBe(200);
      expect(res.body.is_active).toBe(1);
    });

    it('should create rule with is_active false', async () => {
      const res = await request(app)
        .put(`/api/teams/${teamId}/alert-rules`)
        .send({ severity_filter: 'critical', is_active: false });

      expect(res.status).toBe(200);
      expect(res.body.is_active).toBe(0);
    });
  });

  // ─── Alert History ────────────────────────────────────────────

  describe('GET /api/teams/:id/alert-history', () => {
    beforeEach(() => {
      // Create a channel and history entries
      testDb.exec(`
        INSERT INTO alert_channels (id, team_id, channel_type, config)
        VALUES ('ch-hist', 'team-1', 'slack', '{"webhook_url":"https://hooks.slack.com/services/T/B/h"}')
      `);
      testDb.exec(`
        INSERT INTO alert_history (id, alert_channel_id, service_id, event_type, sent_at, status)
        VALUES
          ('hist-1', 'ch-hist', 'service-1', 'status_change', '2024-01-15T10:00:00.000Z', 'sent'),
          ('hist-2', 'ch-hist', 'service-1', 'poll_error', '2024-01-15T10:05:00.000Z', 'failed'),
          ('hist-3', 'ch-hist', 'service-1', 'status_change', '2024-01-15T10:10:00.000Z', 'suppressed')
      `);
    });

    it('should return paginated history', async () => {
      const res = await request(app).get(`/api/teams/${teamId}/alert-history`);
      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(3);
      expect(res.body.limit).toBe(50);
      expect(res.body.offset).toBe(0);
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/alert-history?status=sent`);

      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0].status).toBe('sent');
    });

    it('should support limit and offset', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/alert-history?limit=1&offset=1`);

      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.limit).toBe(1);
      expect(res.body.offset).toBe(1);
    });

    it('should clamp limit to max 250', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/alert-history?limit=500`);

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(250);
    });

    it('should reject invalid status filter', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/alert-history?status=invalid`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('status');
    });

    it('should return empty for team with no history', async () => {
      const res = await request(app)
        .get(`/api/teams/${otherTeamId}/alert-history`);

      expect(res.status).toBe(200);
      expect(res.body.entries).toEqual([]);
    });

    it('should allow team members to view history', async () => {
      currentUser = memberUser;
      const res = await request(app)
        .get(`/api/teams/${teamId}/alert-history`);

      expect(res.status).toBe(200);
    });

    it('should deny non-members from viewing history', async () => {
      currentUser = nonMemberUser;
      const res = await request(app)
        .get(`/api/teams/${teamId}/alert-history`);

      expect(res.status).toBe(403);
    });
  });
});
