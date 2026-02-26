import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { User } from '../../db/types';

// Create in-memory database for testing
const testDb = new Database(':memory:');

// Mock the db module
jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

// Mock auth middleware to set req.user from currentUser but still call next
jest.mock('../../auth', () => ({
  requireAuth: jest.fn((req: Request, _res: Response, next: NextFunction) => {
    req.user = currentUser;
    next();
  }),
  requireAdmin: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireTeamAccess: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireTeamLead: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireServiceTeamAccess: jest.fn((req: Request, _res: Response, next: NextFunction) => {
    req.user = currentUser;
    next();
  }),
  requireServiceTeamLead: jest.fn((req: Request, _res: Response, next: NextFunction) => {
    req.user = currentUser;
    next();
  }),
  requireBodyTeamLead: jest.fn((req: Request, _res: Response, next: NextFunction) => {
    req.user = currentUser;
    next();
  }),
}));

import servicesRouter from './index';

// Test users
let adminUser: User;
let teamAMemberUser: User;
let teamALeadUser: User;
let nonMemberUser: User;

// Current user for test requests
let currentUser: User;

const app = express();
app.use(express.json());
app.use('/api/services', servicesRouter);

describe('Services API - Team-scoped Authorization', () => {
  let teamAId: string;
  let teamBId: string;
  let teamAServiceId: string;
  let teamBServiceId: string;

  beforeAll(() => {
    testDb.pragma('foreign_keys = ON');

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        oidc_subject TEXT UNIQUE,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS team_members (
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('lead', 'member')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (team_id, user_id),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS services (
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
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS dependencies (
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
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        UNIQUE (service_id, name)
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS dependency_associations (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        linked_service_id TEXT NOT NULL,
        association_type TEXT NOT NULL DEFAULT 'other',
        is_auto_suggested INTEGER NOT NULL DEFAULT 0,
        confidence_score INTEGER,
        is_dismissed INTEGER NOT NULL DEFAULT 0,
        match_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE,
        FOREIGN KEY (linked_service_id) REFERENCES services(id) ON DELETE CASCADE,
        UNIQUE(dependency_id, linked_service_id)
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS dependency_canonical_overrides (
        id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL UNIQUE,
        contact_override TEXT,
        impact_override TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by TEXT
      )
    `);
  });

  beforeEach(() => {
    // Clear tables
    testDb.exec('DELETE FROM dependency_associations');
    testDb.exec('DELETE FROM dependencies');
    testDb.exec('DELETE FROM services');
    testDb.exec('DELETE FROM team_members');
    testDb.exec('DELETE FROM teams');
    testDb.exec('DELETE FROM users');

    // Create users
    const adminId = randomUUID();
    const leadId = randomUUID();
    const memberId = randomUUID();
    const nonMemberId = randomUUID();

    testDb.prepare(`INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)`).run(
      adminId, 'admin@test.com', 'Admin', 'admin'
    );
    testDb.prepare(`INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)`).run(
      leadId, 'lead@test.com', 'Team A Lead', 'user'
    );
    testDb.prepare(`INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)`).run(
      memberId, 'member@test.com', 'Team A Member', 'user'
    );
    testDb.prepare(`INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)`).run(
      nonMemberId, 'outsider@test.com', 'No Teams', 'user'
    );

    adminUser = {
      id: adminId, email: 'admin@test.com', name: 'Admin',
      oidc_subject: null, password_hash: null, role: 'admin', is_active: 1,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    teamALeadUser = {
      id: leadId, email: 'lead@test.com', name: 'Team A Lead',
      oidc_subject: null, password_hash: null, role: 'user', is_active: 1,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    teamAMemberUser = {
      id: memberId, email: 'member@test.com', name: 'Team A Member',
      oidc_subject: null, password_hash: null, role: 'user', is_active: 1,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    nonMemberUser = {
      id: nonMemberId, email: 'outsider@test.com', name: 'No Teams',
      oidc_subject: null, password_hash: null, role: 'user', is_active: 1,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };

    // Create teams
    teamAId = randomUUID();
    teamBId = randomUUID();

    testDb.prepare(`INSERT INTO teams (id, name) VALUES (?, ?)`).run(teamAId, 'Team A');
    testDb.prepare(`INSERT INTO teams (id, name) VALUES (?, ?)`).run(teamBId, 'Team B');

    // Add memberships: lead and member on Team A only
    testDb.prepare(`INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)`).run(
      teamAId, leadId, 'lead'
    );
    testDb.prepare(`INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)`).run(
      teamAId, memberId, 'member'
    );

    // Create services
    teamAServiceId = randomUUID();
    teamBServiceId = randomUUID();

    testDb.prepare(`INSERT INTO services (id, name, team_id, health_endpoint) VALUES (?, ?, ?, ?)`).run(
      teamAServiceId, 'Team A Service', teamAId, 'https://a.example.com/health'
    );
    testDb.prepare(`INSERT INTO services (id, name, team_id, health_endpoint) VALUES (?, ?, ?, ?)`).run(
      teamBServiceId, 'Team B Service', teamBId, 'https://b.example.com/health'
    );
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/services - team-scoped filtering', () => {
    it('should return all services for admin users', async () => {
      currentUser = adminUser;

      const response = await request(app).get('/api/services');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });

    it('should return only team services for non-admin team member', async () => {
      currentUser = teamAMemberUser;

      const response = await request(app).get('/api/services');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Team A Service');
    });

    it('should return only team services for non-admin team lead', async () => {
      currentUser = teamALeadUser;

      const response = await request(app).get('/api/services');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Team A Service');
    });

    it('should return empty array for user with no team memberships', async () => {
      currentUser = nonMemberUser;

      const response = await request(app).get('/api/services');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(0);
    });

    it('should allow admin to filter by any team_id', async () => {
      currentUser = adminUser;

      const response = await request(app)
        .get('/api/services')
        .query({ team_id: teamBId });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Team B Service');
    });

    it('should allow team member to filter by own team_id', async () => {
      currentUser = teamAMemberUser;

      const response = await request(app)
        .get('/api/services')
        .query({ team_id: teamAId });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
    });

    it('should return 403 when non-admin filters by team they are not a member of', async () => {
      currentUser = teamAMemberUser;

      const response = await request(app)
        .get('/api/services')
        .query({ team_id: teamBId });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Team access required');
    });

    it('should return services from multiple teams when user is member of multiple', async () => {
      // Add teamAMemberUser to Team B as well
      testDb.prepare(`INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)`).run(
        teamBId, teamAMemberUser.id, 'member'
      );

      currentUser = teamAMemberUser;

      const response = await request(app).get('/api/services');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);

      // Cleanup
      testDb.prepare(`DELETE FROM team_members WHERE team_id = ? AND user_id = ?`).run(
        teamBId, teamAMemberUser.id
      );
    });
  });

  describe('GET /api/services/:id - team-scoped access', () => {
    it('should allow admin to view any service', async () => {
      currentUser = adminUser;

      const response = await request(app).get(`/api/services/${teamBServiceId}`);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Team B Service');
    });

    it('should allow team member to view own team service', async () => {
      currentUser = teamAMemberUser;

      const response = await request(app).get(`/api/services/${teamAServiceId}`);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Team A Service');
    });

    it('should return 403 when non-admin views service from another team', async () => {
      currentUser = teamAMemberUser;

      const response = await request(app).get(`/api/services/${teamBServiceId}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Team access required');
    });

    it('should return 403 for user with no team memberships viewing any service', async () => {
      currentUser = nonMemberUser;

      const response = await request(app).get(`/api/services/${teamAServiceId}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Team access required');
    });

    it('should return 404 for non-existent service', async () => {
      currentUser = adminUser;

      const response = await request(app).get(`/api/services/${randomUUID()}`);

      expect(response.status).toBe(404);
    });
  });
});
