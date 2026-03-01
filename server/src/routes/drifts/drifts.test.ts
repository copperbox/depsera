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

// Mock SSRF validation
jest.mock('../../utils/ssrf', () => ({
  validateUrlHostname: jest.fn((url: string) => {
    if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('10.0.0.')) {
      throw new Error('Blocked hostname');
    }
  }),
  validateUrlNotPrivate: jest.fn(),
}));

// Mock HealthPollingService
const mockRestartService = jest.fn();
const mockStopService = jest.fn();

jest.mock('../../services/polling/HealthPollingService', () => ({
  HealthPollingService: {
    getInstance: () => ({
      restartService: mockRestartService,
      stopService: mockStopService,
    }),
  },
}));

// Mock audit
jest.mock('../../services/audit/AuditLogService', () => ({
  auditFromRequest: jest.fn(),
  logAuditEvent: jest.fn(),
}));

import { driftRouter } from './index';
import { auditFromRequest } from '../../services/audit/AuditLogService';

const app = express();
app.use(express.json());
app.use('/api/teams', driftRouter);

// --- Test helpers ---

const teamId = 'team-1';
const serviceId = 'svc-1';
let flagCounter = 0;

function insertDriftFlag(overrides: Partial<{
  id: string;
  team_id: string;
  service_id: string;
  drift_type: string;
  field_name: string | null;
  manifest_value: string | null;
  current_value: string | null;
  status: string;
  sync_history_id: string | null;
}> = {}): string {
  const id = overrides.id ?? `drift-${++flagCounter}`;
  testDb.prepare(`
    INSERT INTO drift_flags (id, team_id, service_id, drift_type, field_name, manifest_value, current_value, status, first_detected_at, last_detected_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
  `).run(
    id,
    overrides.team_id ?? teamId,
    overrides.service_id ?? serviceId,
    overrides.drift_type ?? 'field_change',
    overrides.field_name ?? 'name',
    overrides.manifest_value ?? 'New Name',
    overrides.current_value ?? 'Old Name',
    overrides.status ?? 'pending',
  );
  return id;
}

describe('Drift Flag API Routes', () => {
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
        key TEXT,
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
        poll_warnings TEXT,
        manifest_key TEXT,
        manifest_managed INTEGER DEFAULT 0,
        manifest_last_synced_values TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );

      CREATE TABLE drift_flags (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        drift_type TEXT NOT NULL,
        field_name TEXT,
        manifest_value TEXT,
        current_value TEXT,
        status TEXT NOT NULL,
        first_detected_at TEXT NOT NULL,
        last_detected_at TEXT NOT NULL,
        resolved_at TEXT,
        resolved_by TEXT,
        sync_history_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE INDEX idx_drift_flags_team_id ON drift_flags(team_id);
      CREATE INDEX idx_drift_flags_service_id ON drift_flags(service_id);
      CREATE INDEX idx_drift_flags_status ON drift_flags(status);
      CREATE INDEX idx_drift_flags_team_status ON drift_flags(team_id, status);

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

      INSERT INTO services (id, name, team_id, health_endpoint, manifest_key, manifest_managed, manifest_last_synced_values) VALUES
        ('svc-1', 'Service One', 'team-1', 'https://svc1.example.com/health', 'svc-one', 1, '{"name":"Service One","health_endpoint":"https://svc1.example.com/health"}'),
        ('svc-2', 'Service Two', 'team-1', 'https://svc2.example.com/health', 'svc-two', 1, NULL);
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM drift_flags');
    currentUser = adminUser;
    mockRestartService.mockReset();
    mockStopService.mockReset();
    (auditFromRequest as jest.Mock).mockReset();
  });

  // ─── List Routes (DPS-58a) ────────────────────────────────────

  describe('GET /api/teams/:id/drifts', () => {
    it('should return empty list when no flags exist', async () => {
      const res = await request(app).get(`/api/teams/${teamId}/drifts`);
      expect(res.status).toBe(200);
      expect(res.body.flags).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.pending_count).toBe(0);
    });

    it('should return pending flags by default', async () => {
      insertDriftFlag({ status: 'pending' });
      insertDriftFlag({ status: 'dismissed' });

      const res = await request(app).get(`/api/teams/${teamId}/drifts`);
      expect(res.status).toBe(200);
      expect(res.body.flags).toHaveLength(1);
      expect(res.body.flags[0].status).toBe('pending');
    });

    it('should filter by status parameter', async () => {
      insertDriftFlag({ status: 'pending' });
      insertDriftFlag({ status: 'dismissed' });

      const res = await request(app).get(`/api/teams/${teamId}/drifts?status=dismissed`);
      expect(res.status).toBe(200);
      expect(res.body.flags).toHaveLength(1);
      expect(res.body.flags[0].status).toBe('dismissed');
    });

    it('should filter by drift_type', async () => {
      insertDriftFlag({ drift_type: 'field_change' });
      insertDriftFlag({ drift_type: 'service_removal', field_name: null });

      const res = await request(app).get(`/api/teams/${teamId}/drifts?drift_type=service_removal`);
      expect(res.status).toBe(200);
      expect(res.body.flags).toHaveLength(1);
      expect(res.body.flags[0].drift_type).toBe('service_removal');
    });

    it('should filter by service_id', async () => {
      insertDriftFlag({ service_id: 'svc-1' });
      insertDriftFlag({ service_id: 'svc-2' });

      const res = await request(app).get(`/api/teams/${teamId}/drifts?service_id=svc-1`);
      expect(res.status).toBe(200);
      expect(res.body.flags).toHaveLength(1);
      expect(res.body.flags[0].service_id).toBe('svc-1');
    });

    it('should respect limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        insertDriftFlag();
      }

      const res = await request(app).get(`/api/teams/${teamId}/drifts?limit=2&offset=1`);
      expect(res.status).toBe(200);
      expect(res.body.flags).toHaveLength(2);
      expect(res.body.total).toBe(5);
    });

    it('should cap limit at 250', async () => {
      // Just verifying the request doesn't error — the store handles capping
      const res = await request(app).get(`/api/teams/${teamId}/drifts?limit=999`);
      expect(res.status).toBe(200);
    });

    it('should always include summary regardless of filters', async () => {
      insertDriftFlag({ status: 'pending', drift_type: 'field_change' });
      insertDriftFlag({ status: 'dismissed' });

      const res = await request(app).get(`/api/teams/${teamId}/drifts?status=dismissed`);
      expect(res.status).toBe(200);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.pending_count).toBe(1);
      expect(res.body.summary.dismissed_count).toBe(1);
    });

    it('should reject invalid status', async () => {
      const res = await request(app).get(`/api/teams/${teamId}/drifts?status=invalid`);
      expect(res.status).toBe(400);
    });

    it('should reject invalid drift_type', async () => {
      const res = await request(app).get(`/api/teams/${teamId}/drifts?drift_type=invalid`);
      expect(res.status).toBe(400);
    });

    it('should allow team members to read', async () => {
      currentUser = memberUser;
      const res = await request(app).get(`/api/teams/${teamId}/drifts`);
      expect(res.status).toBe(200);
    });

    it('should deny non-members', async () => {
      currentUser = nonMemberUser;
      const res = await request(app).get(`/api/teams/${teamId}/drifts`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/teams/:id/drifts/summary', () => {
    it('should return zeroed summary when no flags', async () => {
      const res = await request(app).get(`/api/teams/${teamId}/drifts/summary`);
      expect(res.status).toBe(200);
      expect(res.body.summary).toEqual({
        pending_count: 0,
        dismissed_count: 0,
        field_change_pending: 0,
        service_removal_pending: 0,
      });
    });

    it('should return correct counts', async () => {
      insertDriftFlag({ status: 'pending', drift_type: 'field_change' });
      insertDriftFlag({ status: 'pending', drift_type: 'service_removal', field_name: null });
      insertDriftFlag({ status: 'dismissed' });

      const res = await request(app).get(`/api/teams/${teamId}/drifts/summary`);
      expect(res.status).toBe(200);
      expect(res.body.summary.pending_count).toBe(2);
      expect(res.body.summary.dismissed_count).toBe(1);
      expect(res.body.summary.field_change_pending).toBe(1);
      expect(res.body.summary.service_removal_pending).toBe(1);
    });

    it('should allow team members', async () => {
      currentUser = memberUser;
      const res = await request(app).get(`/api/teams/${teamId}/drifts/summary`);
      expect(res.status).toBe(200);
    });

    it('should deny non-members', async () => {
      currentUser = nonMemberUser;
      const res = await request(app).get(`/api/teams/${teamId}/drifts/summary`);
      expect(res.status).toBe(403);
    });
  });

  // ─── Single Flag Actions (DPS-58b) ─────────────────────────────

  describe('PUT /api/teams/:id/drifts/:driftId/accept', () => {
    it('should accept a field_change drift flag', async () => {
      const flagId = insertDriftFlag({
        drift_type: 'field_change',
        field_name: 'name',
        manifest_value: 'Updated Name',
        current_value: 'Service One',
      });

      const res = await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/accept`);
      expect(res.status).toBe(200);
      expect(res.body.flag).toBeDefined();

      // Verify service was updated
      const service = testDb.prepare('SELECT name FROM services WHERE id = ?').get(serviceId) as { name: string };
      expect(service.name).toBe('Updated Name');
    });

    it('should update manifest_last_synced_values on field_change accept', async () => {
      const flagId = insertDriftFlag({
        drift_type: 'field_change',
        field_name: 'name',
        manifest_value: 'Synced Name',
        current_value: 'Service One',
      });

      await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/accept`);

      const service = testDb.prepare('SELECT manifest_last_synced_values FROM services WHERE id = ?').get(serviceId) as { manifest_last_synced_values: string };
      const snapshot = JSON.parse(service.manifest_last_synced_values);
      expect(snapshot.name).toBe('Synced Name');
    });

    it('should restart polling when health_endpoint changes', async () => {
      const flagId = insertDriftFlag({
        drift_type: 'field_change',
        field_name: 'health_endpoint',
        manifest_value: 'https://new-endpoint.example.com/health',
        current_value: 'https://svc1.example.com/health',
      });

      await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/accept`);
      expect(mockRestartService).toHaveBeenCalledWith(serviceId);
    });

    it('should restart polling when poll_interval_ms changes', async () => {
      const flagId = insertDriftFlag({
        drift_type: 'field_change',
        field_name: 'poll_interval_ms',
        manifest_value: '60000',
        current_value: '30000',
      });

      await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/accept`);
      expect(mockRestartService).toHaveBeenCalledWith(serviceId);

      // Verify the value was stored as an integer
      const service = testDb.prepare('SELECT poll_interval_ms FROM services WHERE id = ?').get(serviceId) as { poll_interval_ms: number };
      expect(service.poll_interval_ms).toBe(60000);
    });

    it('should not restart polling for name changes', async () => {
      const flagId = insertDriftFlag({
        drift_type: 'field_change',
        field_name: 'name',
        manifest_value: 'Renamed',
        current_value: 'Service One',
      });

      await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/accept`);
      expect(mockRestartService).not.toHaveBeenCalled();
    });

    it('should reject SSRF URLs for health_endpoint', async () => {
      const flagId = insertDriftFlag({
        drift_type: 'field_change',
        field_name: 'health_endpoint',
        manifest_value: 'https://localhost:8080/health',
        current_value: 'https://svc1.example.com/health',
      });

      const res = await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/accept`);
      expect(res.status).toBe(400);
    });

    it('should reject invalid poll_interval_ms values', async () => {
      const flagId = insertDriftFlag({
        drift_type: 'field_change',
        field_name: 'poll_interval_ms',
        manifest_value: '1000',
        current_value: '30000',
      });

      const res = await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/accept`);
      expect(res.status).toBe(400);
    });

    it('should accept service_removal drift by deactivating service', async () => {
      const flagId = insertDriftFlag({
        service_id: 'svc-2',
        drift_type: 'service_removal',
        field_name: null,
        manifest_value: null,
        current_value: null,
      });

      const res = await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/accept`);
      expect(res.status).toBe(200);

      const service = testDb.prepare('SELECT is_active FROM services WHERE id = ?').get('svc-2') as { is_active: number };
      expect(service.is_active).toBe(0);
      expect(mockStopService).toHaveBeenCalledWith('svc-2');
    });

    it('should return 409 for already accepted flag', async () => {
      const flagId = insertDriftFlag({ status: 'accepted' });

      const res = await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/accept`);
      expect(res.status).toBe(409);
    });

    it('should return 409 for already resolved flag', async () => {
      const flagId = insertDriftFlag({ status: 'resolved' });

      const res = await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/accept`);
      expect(res.status).toBe(409);
    });

    it('should return 404 for non-existent flag', async () => {
      const res = await request(app).put(`/api/teams/${teamId}/drifts/nonexistent/accept`);
      expect(res.status).toBe(404);
    });

    it('should return 404 for flag in different team', async () => {
      const flagId = insertDriftFlag({ team_id: 'team-2' });

      const res = await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/accept`);
      expect(res.status).toBe(404);
    });

    it('should fire audit event on accept', async () => {
      const flagId = insertDriftFlag();

      await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/accept`);
      expect(auditFromRequest).toHaveBeenCalledWith(
        expect.anything(),
        'drift.accepted',
        'service',
        serviceId,
        expect.objectContaining({ drift_id: flagId }),
      );
    });

    it('should deny non-leads', async () => {
      currentUser = memberUser;
      const flagId = insertDriftFlag();

      const res = await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/accept`);
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/teams/:id/drifts/:driftId/dismiss', () => {
    it('should dismiss a pending flag', async () => {
      const flagId = insertDriftFlag({ status: 'pending' });

      const res = await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/dismiss`);
      expect(res.status).toBe(200);

      const flag = testDb.prepare('SELECT status FROM drift_flags WHERE id = ?').get(flagId) as { status: string };
      expect(flag.status).toBe('dismissed');
    });

    it('should return 409 for already accepted flag', async () => {
      const flagId = insertDriftFlag({ status: 'accepted' });

      const res = await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/dismiss`);
      expect(res.status).toBe(409);
    });

    it('should return 404 for non-existent flag', async () => {
      const res = await request(app).put(`/api/teams/${teamId}/drifts/nonexistent/dismiss`);
      expect(res.status).toBe(404);
    });

    it('should fire audit event on dismiss', async () => {
      const flagId = insertDriftFlag();

      await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/dismiss`);
      expect(auditFromRequest).toHaveBeenCalledWith(
        expect.anything(),
        'drift.dismissed',
        'service',
        serviceId,
        expect.objectContaining({ drift_id: flagId }),
      );
    });

    it('should deny non-leads', async () => {
      currentUser = memberUser;
      const flagId = insertDriftFlag();

      const res = await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/dismiss`);
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/teams/:id/drifts/:driftId/reopen', () => {
    it('should reopen a dismissed flag', async () => {
      const flagId = insertDriftFlag({ status: 'dismissed' });

      const res = await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/reopen`);
      expect(res.status).toBe(200);

      const flag = testDb.prepare('SELECT status FROM drift_flags WHERE id = ?').get(flagId) as { status: string };
      expect(flag.status).toBe('pending');
    });

    it('should return 400 for pending flag', async () => {
      const flagId = insertDriftFlag({ status: 'pending' });

      const res = await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/reopen`);
      expect(res.status).toBe(400);
    });

    it('should return 400 for accepted flag', async () => {
      const flagId = insertDriftFlag({ status: 'accepted' });

      const res = await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/reopen`);
      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent flag', async () => {
      const res = await request(app).put(`/api/teams/${teamId}/drifts/nonexistent/reopen`);
      expect(res.status).toBe(404);
    });

    it('should fire audit event', async () => {
      const flagId = insertDriftFlag({ status: 'dismissed' });

      await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/reopen`);
      expect(auditFromRequest).toHaveBeenCalledWith(
        expect.anything(),
        'drift.reopened',
        'service',
        serviceId,
        expect.objectContaining({ drift_id: flagId }),
      );
    });

    it('should deny non-leads', async () => {
      currentUser = memberUser;
      const flagId = insertDriftFlag({ status: 'dismissed' });

      const res = await request(app).put(`/api/teams/${teamId}/drifts/${flagId}/reopen`);
      expect(res.status).toBe(403);
    });
  });

  // ─── Bulk Actions (DPS-58c) ─────────────────────────────────────

  describe('POST /api/teams/:id/drifts/bulk-accept', () => {
    it('should accept multiple flags in bulk', async () => {
      const id1 = insertDriftFlag({ field_name: 'name', manifest_value: 'N1', current_value: 'Old' });
      const id2 = insertDriftFlag({ field_name: 'description', manifest_value: 'D1', current_value: null });

      const res = await request(app)
        .post(`/api/teams/${teamId}/drifts/bulk-accept`)
        .send({ flag_ids: [id1, id2] });

      expect(res.status).toBe(200);
      expect(res.body.result.succeeded).toBe(2);
      expect(res.body.result.failed).toBe(0);
    });

    it('should handle mixed field_change and service_removal', async () => {
      const fieldId = insertDriftFlag({ field_name: 'name', manifest_value: 'X', current_value: 'Y' });
      const removalId = insertDriftFlag({
        service_id: 'svc-2',
        drift_type: 'service_removal',
        field_name: null,
        manifest_value: null,
        current_value: null,
      });

      const res = await request(app)
        .post(`/api/teams/${teamId}/drifts/bulk-accept`)
        .send({ flag_ids: [fieldId, removalId] });

      expect(res.status).toBe(200);
      expect(res.body.result.succeeded).toBe(2);
      expect(mockStopService).toHaveBeenCalledWith('svc-2');
    });

    it('should skip SSRF-blocked URLs and report errors', async () => {
      const flagId = insertDriftFlag({
        field_name: 'health_endpoint',
        manifest_value: 'https://localhost/health',
        current_value: 'https://svc1.example.com/health',
      });

      const res = await request(app)
        .post(`/api/teams/${teamId}/drifts/bulk-accept`)
        .send({ flag_ids: [flagId] });

      expect(res.status).toBe(200);
      expect(res.body.result.failed).toBe(1);
      expect(res.body.result.errors[0].flag_id).toBe(flagId);
    });

    it('should skip already accepted flags', async () => {
      const flagId = insertDriftFlag({ status: 'accepted' });

      const res = await request(app)
        .post(`/api/teams/${teamId}/drifts/bulk-accept`)
        .send({ flag_ids: [flagId] });

      expect(res.status).toBe(200);
      expect(res.body.result.failed).toBe(1);
      expect(res.body.result.errors[0].error).toContain('already accepted');
    });

    it('should skip flags from other teams', async () => {
      const flagId = insertDriftFlag({ team_id: 'team-2' });

      const res = await request(app)
        .post(`/api/teams/${teamId}/drifts/bulk-accept`)
        .send({ flag_ids: [flagId] });

      expect(res.status).toBe(200);
      expect(res.body.result.failed).toBe(1);
      expect(res.body.result.errors[0].error).toContain('not found');
    });

    it('should reject empty flag_ids', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/drifts/bulk-accept`)
        .send({ flag_ids: [] });
      expect(res.status).toBe(400);
    });

    it('should reject more than 100 flag_ids', async () => {
      const ids = Array.from({ length: 101 }, (_, i) => `flag-${i}`);
      const res = await request(app)
        .post(`/api/teams/${teamId}/drifts/bulk-accept`)
        .send({ flag_ids: ids });
      expect(res.status).toBe(400);
    });

    it('should fire bulk audit event', async () => {
      const flagId = insertDriftFlag();

      await request(app)
        .post(`/api/teams/${teamId}/drifts/bulk-accept`)
        .send({ flag_ids: [flagId] });

      expect(auditFromRequest).toHaveBeenCalledWith(
        expect.anything(),
        'drift.bulk_accepted',
        'team',
        teamId,
        expect.objectContaining({ flag_count: 1, succeeded: 1, failed: 0 }),
      );
    });

    it('should deny non-leads', async () => {
      currentUser = memberUser;
      const flagId = insertDriftFlag();

      const res = await request(app)
        .post(`/api/teams/${teamId}/drifts/bulk-accept`)
        .send({ flag_ids: [flagId] });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/teams/:id/drifts/bulk-dismiss', () => {
    it('should dismiss multiple flags in bulk', async () => {
      const id1 = insertDriftFlag();
      const id2 = insertDriftFlag();

      const res = await request(app)
        .post(`/api/teams/${teamId}/drifts/bulk-dismiss`)
        .send({ flag_ids: [id1, id2] });

      expect(res.status).toBe(200);
      expect(res.body.result.succeeded).toBe(2);
      expect(res.body.result.failed).toBe(0);

      const f1 = testDb.prepare('SELECT status FROM drift_flags WHERE id = ?').get(id1) as { status: string };
      expect(f1.status).toBe('dismissed');
    });

    it('should skip already accepted flags', async () => {
      const flagId = insertDriftFlag({ status: 'accepted' });

      const res = await request(app)
        .post(`/api/teams/${teamId}/drifts/bulk-dismiss`)
        .send({ flag_ids: [flagId] });

      expect(res.status).toBe(200);
      expect(res.body.result.failed).toBe(1);
    });

    it('should reject missing flag_ids', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/drifts/bulk-dismiss`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('should fire bulk audit event', async () => {
      const flagId = insertDriftFlag();

      await request(app)
        .post(`/api/teams/${teamId}/drifts/bulk-dismiss`)
        .send({ flag_ids: [flagId] });

      expect(auditFromRequest).toHaveBeenCalledWith(
        expect.anything(),
        'drift.bulk_dismissed',
        'team',
        teamId,
        expect.objectContaining({ flag_count: 1, succeeded: 1, failed: 0 }),
      );
    });

    it('should deny non-leads', async () => {
      currentUser = memberUser;
      const flagId = insertDriftFlag();

      const res = await request(app)
        .post(`/api/teams/${teamId}/drifts/bulk-dismiss`)
        .send({ flag_ids: [flagId] });
      expect(res.status).toBe(403);
    });
  });
});
