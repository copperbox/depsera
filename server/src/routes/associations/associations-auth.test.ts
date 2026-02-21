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

// Mock auth middleware to just call next (auth is applied at app level, not route level)
jest.mock('../../auth', () => ({
  requireAuth: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireAdmin: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireTeamAccess: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireTeamLead: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireServiceTeamLead: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireBodyTeamLead: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));

// Mock the AssociationMatcher
const mockAcceptSuggestion = jest.fn();
const mockDismissSuggestion = jest.fn();
const mockGenerateSuggestions = jest.fn();
const mockGenerateSuggestionsForService = jest.fn();

jest.mock('../../services/matching', () => ({
  AssociationMatcher: {
    getInstance: () => ({
      acceptSuggestion: mockAcceptSuggestion,
      dismissSuggestion: mockDismissSuggestion,
      generateSuggestions: mockGenerateSuggestions,
      generateSuggestionsForService: mockGenerateSuggestionsForService,
    }),
  },
}));

import associationsRouter from './index';

// Test users
let adminUser: User;
let teamMemberUser: User;
let nonMemberUser: User;

// Current user for test requests (changeable per test)
let currentUser: User;

function createApp() {
  const app = express();
  app.use(express.json());
  // Set req.user to currentUser for each request
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = currentUser;
    next();
  });
  app.use('/api', associationsRouter);
  return app;
}

const app = createApp();

describe('Associations API - Authorization (IDOR)', () => {
  let teamId: string;
  let otherTeamId: string;
  let serviceId: string;
  let otherTeamServiceId: string;
  let linkedServiceId: string;
  let dependencyId: string;
  let otherTeamDependencyId: string;

  beforeAll(() => {
    testDb.pragma('foreign_keys = ON');

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        oidc_subject TEXT UNIQUE,
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
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_poll_success INTEGER,
        last_poll_error TEXT,
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
        type TEXT,
        version TEXT,
        status TEXT NOT NULL DEFAULT 'unknown',
        latency_ms INTEGER,
        last_check_at TEXT,
        check_details TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        UNIQUE(service_id, name)
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS dependency_associations (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        linked_service_id TEXT NOT NULL,
        association_type TEXT NOT NULL DEFAULT 'api_call',
        is_auto_suggested INTEGER NOT NULL DEFAULT 0,
        confidence_score REAL,
        is_dismissed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE,
        FOREIGN KEY (linked_service_id) REFERENCES services(id) ON DELETE CASCADE,
        UNIQUE(dependency_id, linked_service_id)
      )
    `);
  });

  beforeEach(() => {
    // Clear tables in correct order
    testDb.exec('DELETE FROM dependency_associations');
    testDb.exec('DELETE FROM dependencies');
    testDb.exec('DELETE FROM services');
    testDb.exec('DELETE FROM team_members');
    testDb.exec('DELETE FROM teams');
    testDb.exec('DELETE FROM users');

    jest.clearAllMocks();

    // Create test users
    const adminId = randomUUID();
    const memberId = randomUUID();
    const nonMemberId = randomUUID();

    testDb.prepare(`INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)`).run(
      adminId, 'admin@test.com', 'Admin User', 'admin'
    );
    testDb.prepare(`INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)`).run(
      memberId, 'member@test.com', 'Team Member', 'user'
    );
    testDb.prepare(`INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)`).run(
      nonMemberId, 'outsider@test.com', 'Non Member', 'user'
    );

    adminUser = {
      id: adminId,
      email: 'admin@test.com',
      name: 'Admin User',
      oidc_subject: null,
      role: 'admin',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    teamMemberUser = {
      id: memberId,
      email: 'member@test.com',
      name: 'Team Member',
      oidc_subject: null,
      role: 'user',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    nonMemberUser = {
      id: nonMemberId,
      email: 'outsider@test.com',
      name: 'Non Member',
      oidc_subject: null,
      role: 'user',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Create two teams
    teamId = randomUUID();
    otherTeamId = randomUUID();

    testDb.prepare(`INSERT INTO teams (id, name, description) VALUES (?, ?, ?)`).run(
      teamId, 'Team A', 'User is a member'
    );
    testDb.prepare(`INSERT INTO teams (id, name, description) VALUES (?, ?, ?)`).run(
      otherTeamId, 'Team B', 'User is NOT a member'
    );

    // Add teamMemberUser to Team A only
    testDb.prepare(`INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)`).run(
      teamId, memberId, 'lead'
    );

    // Create services
    serviceId = randomUUID();
    otherTeamServiceId = randomUUID();
    linkedServiceId = randomUUID();

    testDb.prepare(`INSERT INTO services (id, name, team_id, health_endpoint) VALUES (?, ?, ?, ?)`).run(
      serviceId, 'Team A Service', teamId, 'https://a.example.com/health'
    );
    testDb.prepare(`INSERT INTO services (id, name, team_id, health_endpoint) VALUES (?, ?, ?, ?)`).run(
      otherTeamServiceId, 'Team B Service', otherTeamId, 'https://b.example.com/health'
    );
    testDb.prepare(`INSERT INTO services (id, name, team_id, health_endpoint) VALUES (?, ?, ?, ?)`).run(
      linkedServiceId, 'Linked Service', teamId, 'https://linked.example.com/health'
    );

    // Create dependencies
    dependencyId = randomUUID();
    otherTeamDependencyId = randomUUID();

    testDb.prepare(`INSERT INTO dependencies (id, service_id, name, status) VALUES (?, ?, ?, ?)`).run(
      dependencyId, serviceId, 'my-dep', 'healthy'
    );
    testDb.prepare(`INSERT INTO dependencies (id, service_id, name, status) VALUES (?, ?, ?, ?)`).run(
      otherTeamDependencyId, otherTeamServiceId, 'other-dep', 'healthy'
    );

    // Default to admin user
    currentUser = adminUser;
  });

  afterAll(() => {
    testDb.close();
  });

  describe('POST /api/dependencies/:dependencyId/associations - authorization', () => {
    it('should allow admin to create association on any dependency', async () => {
      currentUser = adminUser;

      const response = await request(app)
        .post(`/api/dependencies/${otherTeamDependencyId}/associations`)
        .send({ linked_service_id: linkedServiceId, association_type: 'api_call' });

      expect(response.status).not.toBe(403);
    });

    it('should allow team member to create association on own team dependency', async () => {
      currentUser = teamMemberUser;

      const response = await request(app)
        .post(`/api/dependencies/${dependencyId}/associations`)
        .send({ linked_service_id: linkedServiceId, association_type: 'api_call' });

      expect(response.status).toBe(201);
    });

    it('should return 403 for non-member creating association on another team dependency', async () => {
      currentUser = teamMemberUser;

      const response = await request(app)
        .post(`/api/dependencies/${otherTeamDependencyId}/associations`)
        .send({ linked_service_id: linkedServiceId, association_type: 'api_call' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Team access required');
    });

    it('should return 403 for user with no team memberships', async () => {
      currentUser = nonMemberUser;

      const response = await request(app)
        .post(`/api/dependencies/${dependencyId}/associations`)
        .send({ linked_service_id: linkedServiceId, association_type: 'api_call' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Team access required');
    });
  });

  describe('DELETE /api/dependencies/:dependencyId/associations/:serviceId - authorization', () => {
    let associationId: string;

    beforeEach(() => {
      // Create associations for both teams
      associationId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type)
        VALUES (?, ?, ?, ?)
      `).run(associationId, otherTeamDependencyId, linkedServiceId, 'api_call');
    });

    it('should allow admin to delete association on any dependency', async () => {
      currentUser = adminUser;

      const response = await request(app)
        .delete(`/api/dependencies/${otherTeamDependencyId}/associations/${linkedServiceId}`);

      expect(response.status).toBe(204);
    });

    it('should return 403 for non-member deleting association on another team dependency', async () => {
      currentUser = teamMemberUser;

      const response = await request(app)
        .delete(`/api/dependencies/${otherTeamDependencyId}/associations/${linkedServiceId}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Team access required');
    });

    it('should allow team member to delete association on own team dependency', async () => {
      currentUser = teamMemberUser;

      // Create association on own team's dependency
      const ownAssocId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type)
        VALUES (?, ?, ?, ?)
      `).run(ownAssocId, dependencyId, linkedServiceId, 'api_call');

      const response = await request(app)
        .delete(`/api/dependencies/${dependencyId}/associations/${linkedServiceId}`);

      expect(response.status).toBe(204);
    });
  });

  describe('POST /api/dependencies/:dependencyId/suggestions/generate - authorization', () => {
    it('should allow admin to generate suggestions for any dependency', async () => {
      currentUser = adminUser;
      mockGenerateSuggestions.mockReturnValue([]);

      const response = await request(app)
        .post(`/api/dependencies/${otherTeamDependencyId}/suggestions/generate`);

      expect(response.status).toBe(200);
    });

    it('should allow team member to generate suggestions for own team dependency', async () => {
      currentUser = teamMemberUser;
      mockGenerateSuggestions.mockReturnValue([]);

      const response = await request(app)
        .post(`/api/dependencies/${dependencyId}/suggestions/generate`);

      expect(response.status).toBe(200);
    });

    it('should return 403 for non-member generating suggestions for another team dependency', async () => {
      currentUser = teamMemberUser;

      const response = await request(app)
        .post(`/api/dependencies/${otherTeamDependencyId}/suggestions/generate`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Team access required');
    });
  });

  describe('POST /api/services/:serviceId/suggestions/generate - authorization', () => {
    it('should allow admin to generate suggestions for any service', async () => {
      currentUser = adminUser;
      mockGenerateSuggestionsForService.mockReturnValue([]);

      const response = await request(app)
        .post(`/api/services/${otherTeamServiceId}/suggestions/generate`);

      expect(response.status).toBe(200);
    });

    it('should allow team member to generate suggestions for own team service', async () => {
      currentUser = teamMemberUser;
      mockGenerateSuggestionsForService.mockReturnValue([]);

      const response = await request(app)
        .post(`/api/services/${serviceId}/suggestions/generate`);

      expect(response.status).toBe(200);
    });

    it('should return 403 for non-member generating suggestions for another team service', async () => {
      currentUser = teamMemberUser;

      const response = await request(app)
        .post(`/api/services/${otherTeamServiceId}/suggestions/generate`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Team access required');
    });
  });

  describe('POST /api/associations/suggestions/:suggestionId/accept - authorization', () => {
    let suggestionId: string;
    let otherTeamSuggestionId: string;

    beforeEach(() => {
      // Create suggestion on own team dependency
      suggestionId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_auto_suggested)
        VALUES (?, ?, ?, ?, ?)
      `).run(suggestionId, dependencyId, linkedServiceId, 'api_call', 1);

      // Create suggestion on other team dependency
      otherTeamSuggestionId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_auto_suggested)
        VALUES (?, ?, ?, ?, ?)
      `).run(otherTeamSuggestionId, otherTeamDependencyId, linkedServiceId, 'api_call', 1);
    });

    it('should allow admin to accept any suggestion', async () => {
      currentUser = adminUser;
      mockAcceptSuggestion.mockReturnValue(true);

      const response = await request(app)
        .post(`/api/associations/suggestions/${otherTeamSuggestionId}/accept`);

      expect(response.status).toBe(200);
    });

    it('should allow team member to accept suggestion for own team dependency', async () => {
      currentUser = teamMemberUser;
      mockAcceptSuggestion.mockReturnValue(true);

      const response = await request(app)
        .post(`/api/associations/suggestions/${suggestionId}/accept`);

      expect(response.status).toBe(200);
    });

    it('should return 403 for non-member accepting suggestion on another team dependency', async () => {
      currentUser = teamMemberUser;

      const response = await request(app)
        .post(`/api/associations/suggestions/${otherTeamSuggestionId}/accept`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Team access required');
    });
  });

  describe('POST /api/associations/suggestions/:suggestionId/dismiss - authorization', () => {
    let suggestionId: string;
    let otherTeamSuggestionId: string;

    beforeEach(() => {
      // Create suggestion on own team dependency
      suggestionId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_auto_suggested)
        VALUES (?, ?, ?, ?, ?)
      `).run(suggestionId, dependencyId, linkedServiceId, 'api_call', 1);

      // Create suggestion on other team dependency
      otherTeamSuggestionId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_auto_suggested)
        VALUES (?, ?, ?, ?, ?)
      `).run(otherTeamSuggestionId, otherTeamDependencyId, linkedServiceId, 'api_call', 1);
    });

    it('should allow admin to dismiss any suggestion', async () => {
      currentUser = adminUser;
      mockDismissSuggestion.mockReturnValue(true);

      const response = await request(app)
        .post(`/api/associations/suggestions/${otherTeamSuggestionId}/dismiss`);

      expect(response.status).toBe(204);
    });

    it('should allow team member to dismiss suggestion for own team dependency', async () => {
      currentUser = teamMemberUser;
      mockDismissSuggestion.mockReturnValue(true);

      const response = await request(app)
        .post(`/api/associations/suggestions/${suggestionId}/dismiss`);

      expect(response.status).toBe(204);
    });

    it('should return 403 for non-member dismissing suggestion on another team dependency', async () => {
      currentUser = teamMemberUser;

      const response = await request(app)
        .post(`/api/associations/suggestions/${otherTeamSuggestionId}/dismiss`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Team access required');
    });
  });
});
