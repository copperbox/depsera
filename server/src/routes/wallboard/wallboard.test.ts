import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { Request, Response, NextFunction } from 'express';
import { User } from '../../db/types';

const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

let currentUser: User;

jest.mock('../../auth', () => ({
  requireAuth: jest.fn((req: Request, _res: Response, next: NextFunction) => {
    req.user = currentUser;
    next();
  }),
}));

import wallboardRouter from './index';
import { StoreRegistry } from '../../stores';
import { requireAuth } from '../../auth';

const app = express();
app.use(express.json());
app.use('/api/wallboard', requireAuth, wallboardRouter);

describe('Wallboard API', () => {
  const adminUser: User = {
    id: 'user-admin',
    email: 'admin@test.com',
    name: 'Admin',
    oidc_subject: null,
    password_hash: null,
    role: 'admin',
    is_active: 1,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
  };

  const normalUser: User = {
    id: 'user-normal',
    email: 'user@test.com',
    name: 'User',
    oidc_subject: null,
    password_hash: null,
    role: 'user',
    is_active: 1,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
  };

  beforeAll(() => {
    StoreRegistry.resetInstance();
    testDb.exec(`
      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
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
        PRIMARY KEY (team_id, user_id)
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
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
        contact TEXT,
        contact_override TEXT,
        impact_override TEXT,
        check_details TEXT,
        error TEXT,
        error_message TEXT,
        skipped INTEGER NOT NULL DEFAULT 0,
        last_checked TEXT,
        last_status_change TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (service_id, name)
      );

      CREATE TABLE dependency_canonical_overrides (
        id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL UNIQUE,
        contact_override TEXT,
        impact_override TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by TEXT
      );

      CREATE TABLE dependency_associations (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        linked_service_id TEXT NOT NULL,
        association_type TEXT DEFAULT 'api_call',
        manifest_managed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (dependency_id, linked_service_id)
      );

      CREATE TABLE dependency_latency_history (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        recorded_at TEXT NOT NULL
      );

      INSERT INTO teams (id, name) VALUES ('team-1', 'Team One'), ('team-2', 'Team Two');
      INSERT INTO team_members (team_id, user_id, role) VALUES ('team-1', 'user-normal', 'member');

      INSERT INTO services (id, name, team_id, health_endpoint) VALUES
        ('svc-1', 'Service Alpha', 'team-1', 'http://alpha/health'),
        ('svc-2', 'Service Beta', 'team-2', 'http://beta/health');

      INSERT INTO dependencies (id, service_id, name, type, healthy, health_state, latency_ms, last_checked) VALUES
        ('dep-1', 'svc-1', 'PostgreSQL', 'database', 1, 0, 25, '2025-01-01T12:00:00Z'),
        ('dep-2', 'svc-2', 'Redis', 'cache', 0, 2, 100, '2025-01-01T12:00:00Z');
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/wallboard', () => {
    it('returns 200 with expected shape', async () => {
      currentUser = adminUser;

      const response = await request(app).get('/api/wallboard');

      expect(response.status).toBe(200);
      expect(response.body.dependencies).toBeDefined();
      expect(response.body.teams).toBeDefined();
      expect(Array.isArray(response.body.dependencies)).toBe(true);
      expect(Array.isArray(response.body.teams)).toBe(true);
    });

    it('admin sees all dependencies across all teams', async () => {
      currentUser = adminUser;

      const response = await request(app).get('/api/wallboard');

      expect(response.status).toBe(200);
      expect(response.body.dependencies).toHaveLength(2);
      expect(response.body.teams).toHaveLength(2);
    });

    it('non-admin user sees only their team dependencies', async () => {
      currentUser = normalUser;

      const response = await request(app).get('/api/wallboard');

      expect(response.status).toBe(200);
      // Normal user is only a member of team-1
      expect(response.body.dependencies).toHaveLength(1);
      expect(response.body.dependencies[0].canonical_name).toBe('PostgreSQL');
      expect(response.body.teams).toHaveLength(1);
    });

    it('returns empty data for user with no team memberships', async () => {
      currentUser = {
        ...normalUser,
        id: 'user-no-teams',
      };

      const response = await request(app).get('/api/wallboard');

      expect(response.status).toBe(200);
      expect(response.body.dependencies).toHaveLength(0);
      expect(response.body.teams).toHaveLength(0);
    });

    it('returns correct dependency fields', async () => {
      currentUser = adminUser;

      const response = await request(app).get('/api/wallboard');

      const dep = response.body.dependencies.find(
        (d: { canonical_name: string }) => d.canonical_name === 'PostgreSQL',
      );
      expect(dep).toBeDefined();
      expect(dep.primary_dependency_id).toBe('dep-1');
      expect(dep.health_status).toBe('healthy');
      expect(dep.type).toBe('database');
      expect(dep.reporters).toHaveLength(1);
      expect(dep.reporters[0].service_name).toBe('Service Alpha');
      expect(dep.team_ids).toContain('team-1');
    });
  });
});
