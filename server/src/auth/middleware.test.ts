import { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

// Create in-memory database for testing
const testDb = new Database(':memory:');

// Mock the db module
jest.mock('../db', () => ({
  db: testDb,
  default: testDb,
}));

import {
  requireAuth,
  requireAdmin,
  requireTeamAccess,
  requireTeamLead,
  requireServiceTeamAccess,
  requireServiceTeamLead,
  requireBodyTeamLead,
} from './middleware';

describe('Auth Middleware', () => {
  let adminId: string;
  let regularUserId: string;
  let teamMemberId: string;
  let teamLeadId: string;
  let inactiveUserId: string;
  let teamId: string;
  let serviceId: string;

  // Helper to create mock request
  const createMockRequest = (overrides: Partial<Request> = {}): Request => {
    return {
      session: {},
      params: {},
      body: {},
      user: undefined,
      teamMembership: undefined,
      ...overrides,
    } as Request;
  };

  // Helper to create mock response
  const createMockResponse = (): Response => {
    const res: Partial<Response> = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    return res as Response;
  };

  beforeAll(() => {
    // Enable foreign keys
    testDb.pragma('foreign_keys = ON');

    // Create tables
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        oidc_subject TEXT UNIQUE,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
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
        role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member')),
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
        last_poll_success INTEGER,
        last_poll_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT
      )
    `);

    // Create test users
    adminId = randomUUID();
    regularUserId = randomUUID();
    teamMemberId = randomUUID();
    teamLeadId = randomUUID();
    inactiveUserId = randomUUID();

    testDb.prepare(`
      INSERT INTO users (id, email, name, role, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(adminId, 'admin@example.com', 'Admin User', 'admin', 1);

    testDb.prepare(`
      INSERT INTO users (id, email, name, role, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(regularUserId, 'regular@example.com', 'Regular User', 'user', 1);

    testDb.prepare(`
      INSERT INTO users (id, email, name, role, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(teamMemberId, 'member@example.com', 'Team Member', 'user', 1);

    testDb.prepare(`
      INSERT INTO users (id, email, name, role, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(teamLeadId, 'lead@example.com', 'Team Lead', 'user', 1);

    testDb.prepare(`
      INSERT INTO users (id, email, name, role, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(inactiveUserId, 'inactive@example.com', 'Inactive User', 'user', 0);

    // Create test team
    teamId = randomUUID();
    testDb.prepare(`
      INSERT INTO teams (id, name, description)
      VALUES (?, ?, ?)
    `).run(teamId, 'Test Team', 'A test team');

    // Create test service
    serviceId = randomUUID();
    testDb.prepare(`
      INSERT INTO services (id, name, team_id, health_endpoint)
      VALUES (?, ?, ?, ?)
    `).run(serviceId, 'Test Service', teamId, 'https://example.com/health');

    // Add team member
    testDb.prepare(`
      INSERT INTO team_members (team_id, user_id, role)
      VALUES (?, ?, ?)
    `).run(teamId, teamMemberId, 'member');

    // Add team lead
    testDb.prepare(`
      INSERT INTO team_members (team_id, user_id, role)
      VALUES (?, ?, ?)
    `).run(teamId, teamLeadId, 'lead');
  });

  afterAll(() => {
    testDb.close();
  });

  describe('requireAuth', () => {
    it('should return 401 when no session userId', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when user not found', () => {
      const req = createMockRequest({
        session: { userId: 'non-existent-user-id', destroy: jest.fn() } as any,
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'User not found or inactive',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when user is inactive', () => {
      const req = createMockRequest({
        session: { userId: inactiveUserId, destroy: jest.fn() } as any,
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'User not found or inactive',
      });
    });

    it('should call next and set req.user when authenticated', () => {
      const req = createMockRequest({
        session: { userId: regularUserId } as any,
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user?.id).toBe(regularUserId);
    });
  });

  describe('requireAdmin', () => {
    it('should return 401 when not authenticated', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when user is not admin', () => {
      const req = createMockRequest({
        session: { userId: regularUserId } as any,
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Admin access required' });
    });

    it('should call next when user is admin', () => {
      const req = createMockRequest({
        session: { userId: adminId } as any,
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireTeamAccess', () => {
    it('should return 401 when not authenticated', () => {
      const req = createMockRequest({ params: { id: teamId } });
      const res = createMockResponse();
      const next = jest.fn();

      requireTeamAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 when no team ID', () => {
      const req = createMockRequest({
        session: { userId: regularUserId } as any,
        params: {},
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireTeamAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Team ID required' });
    });

    it('should return 403 when user is not a team member', () => {
      const req = createMockRequest({
        session: { userId: regularUserId } as any,
        params: { id: teamId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireTeamAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Team access required' });
    });

    it('should call next and set membership when user is a team member', () => {
      const req = createMockRequest({
        session: { userId: teamMemberId } as any,
        params: { id: teamId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireTeamAccess(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.teamMembership).toBeDefined();
      expect(req.teamMembership?.role).toBe('member');
    });

    it('should allow admin without setting membership', () => {
      const req = createMockRequest({
        session: { userId: adminId } as any,
        params: { id: teamId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireTeamAccess(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.teamMembership).toBeUndefined();
    });

    it('should use teamId param as fallback', () => {
      const req = createMockRequest({
        session: { userId: teamMemberId } as any,
        params: { teamId: teamId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireTeamAccess(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireTeamLead', () => {
    it('should return 401 when not authenticated', () => {
      const req = createMockRequest({ params: { id: teamId } });
      const res = createMockResponse();
      const next = jest.fn();

      requireTeamLead(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 when no team ID', () => {
      const req = createMockRequest({
        session: { userId: teamLeadId } as any,
        params: {},
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireTeamLead(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Team ID required' });
    });

    it('should return 403 when user is not a team lead', () => {
      const req = createMockRequest({
        session: { userId: teamMemberId } as any,
        params: { id: teamId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireTeamLead(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Team lead access required',
      });
    });

    it('should call next when user is a team lead', () => {
      const req = createMockRequest({
        session: { userId: teamLeadId } as any,
        params: { id: teamId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireTeamLead(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.teamMembership?.role).toBe('lead');
    });

    it('should allow admin access', () => {
      const req = createMockRequest({
        session: { userId: adminId } as any,
        params: { id: teamId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireTeamLead(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should use teamId param as fallback', () => {
      const req = createMockRequest({
        session: { userId: teamLeadId } as any,
        params: { teamId: teamId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireTeamLead(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireServiceTeamLead', () => {
    it('should return 401 when not authenticated', () => {
      const req = createMockRequest({ params: { id: serviceId } });
      const res = createMockResponse();
      const next = jest.fn();

      requireServiceTeamLead(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 when no service ID', () => {
      const req = createMockRequest({
        session: { userId: teamLeadId } as any,
        params: {},
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireServiceTeamLead(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Service ID required' });
    });

    it('should return 404 when service not found', () => {
      const req = createMockRequest({
        session: { userId: teamLeadId } as any,
        params: { id: 'non-existent-service' },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireServiceTeamLead(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Service not found' });
    });

    it('should return 403 when user is not team lead', () => {
      const req = createMockRequest({
        session: { userId: teamMemberId } as any,
        params: { id: serviceId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireServiceTeamLead(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should call next when user is team lead', () => {
      const req = createMockRequest({
        session: { userId: teamLeadId } as any,
        params: { id: serviceId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireServiceTeamLead(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow admin access', () => {
      const req = createMockRequest({
        session: { userId: adminId } as any,
        params: { id: serviceId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireServiceTeamLead(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireServiceTeamAccess', () => {
    it('should return 401 when not authenticated', () => {
      const req = createMockRequest({ params: { id: serviceId } });
      const res = createMockResponse();
      const next = jest.fn();

      requireServiceTeamAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 when no service ID', () => {
      const req = createMockRequest({
        session: { userId: teamMemberId } as any,
        params: {},
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireServiceTeamAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Service ID required' });
    });

    it('should return 404 when service not found', () => {
      const req = createMockRequest({
        session: { userId: teamMemberId } as any,
        params: { id: 'non-existent-service' },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireServiceTeamAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Service not found' });
    });

    it('should return 403 when user is not a member of the service team', () => {
      const req = createMockRequest({
        session: { userId: regularUserId } as any,
        params: { id: serviceId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireServiceTeamAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should call next when user is a team member (not lead)', () => {
      const req = createMockRequest({
        session: { userId: teamMemberId } as any,
        params: { id: serviceId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireServiceTeamAccess(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.teamMembership?.role).toBe('member');
    });

    it('should call next when user is a team lead', () => {
      const req = createMockRequest({
        session: { userId: teamLeadId } as any,
        params: { id: serviceId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireServiceTeamAccess(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.teamMembership?.role).toBe('lead');
    });

    it('should allow admin access', () => {
      const req = createMockRequest({
        session: { userId: adminId } as any,
        params: { id: serviceId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireServiceTeamAccess(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireBodyTeamLead', () => {
    it('should return 401 when not authenticated', () => {
      const req = createMockRequest({ body: { team_id: teamId } });
      const res = createMockResponse();
      const next = jest.fn();

      requireBodyTeamLead(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 when no team_id in body', () => {
      const req = createMockRequest({
        session: { userId: teamLeadId } as any,
        body: {},
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireBodyTeamLead(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'team_id required in request body',
      });
    });

    it('should return 403 when user is not team lead', () => {
      const req = createMockRequest({
        session: { userId: teamMemberId } as any,
        body: { team_id: teamId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireBodyTeamLead(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should call next when user is team lead', () => {
      const req = createMockRequest({
        session: { userId: teamLeadId } as any,
        body: { team_id: teamId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireBodyTeamLead(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.teamMembership?.role).toBe('lead');
    });

    it('should allow admin access', () => {
      const req = createMockRequest({
        session: { userId: adminId } as any,
        body: { team_id: teamId },
      });
      const res = createMockResponse();
      const next = jest.fn();

      requireBodyTeamLead(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
