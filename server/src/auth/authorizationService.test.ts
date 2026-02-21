import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

// Create in-memory database for testing
const testDb = new Database(':memory:');

// Mock the db module
jest.mock('../db', () => ({
  db: testDb,
  default: testDb,
}));

import { AuthorizationService } from './authorizationService';
import { User } from '../db/types';

describe('AuthorizationService', () => {
  let adminUser: User;
  let regularUser: User;
  let teamMemberUser: User;
  let teamLeadUser: User;
  let teamId: string;
  let serviceId: string;

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

    // Create test users
    const adminId = randomUUID();
    const regularId = randomUUID();
    const memberId = randomUUID();
    const leadId = randomUUID();

    testDb.prepare(`
      INSERT INTO users (id, email, name, role)
      VALUES (?, ?, ?, ?)
    `).run(adminId, 'admin@example.com', 'Admin User', 'admin');

    testDb.prepare(`
      INSERT INTO users (id, email, name, role)
      VALUES (?, ?, ?, ?)
    `).run(regularId, 'regular@example.com', 'Regular User', 'user');

    testDb.prepare(`
      INSERT INTO users (id, email, name, role)
      VALUES (?, ?, ?, ?)
    `).run(memberId, 'member@example.com', 'Team Member', 'user');

    testDb.prepare(`
      INSERT INTO users (id, email, name, role)
      VALUES (?, ?, ?, ?)
    `).run(leadId, 'lead@example.com', 'Team Lead', 'user');

    adminUser = {
      id: adminId,
      email: 'admin@example.com',
      name: 'Admin User',
      oidc_subject: null,
      role: 'admin',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    regularUser = {
      id: regularId,
      email: 'regular@example.com',
      name: 'Regular User',
      oidc_subject: null,
      role: 'user',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    teamMemberUser = {
      id: memberId,
      email: 'member@example.com',
      name: 'Team Member',
      oidc_subject: null,
      role: 'user',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    teamLeadUser = {
      id: leadId,
      email: 'lead@example.com',
      name: 'Team Lead',
      oidc_subject: null,
      role: 'user',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

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
    `).run(teamId, memberId, 'member');

    // Add team lead
    testDb.prepare(`
      INSERT INTO team_members (team_id, user_id, role)
      VALUES (?, ?, ?)
    `).run(teamId, leadId, 'lead');
  });

  afterAll(() => {
    testDb.close();
  });

  describe('checkTeamMembership', () => {
    it('should return membership for a team member', () => {
      const membership = AuthorizationService.checkTeamMembership(
        teamMemberUser.id,
        teamId
      );
      expect(membership).toBeDefined();
      expect(membership?.role).toBe('member');
    });

    it('should return membership for a team lead', () => {
      const membership = AuthorizationService.checkTeamMembership(
        teamLeadUser.id,
        teamId
      );
      expect(membership).toBeDefined();
      expect(membership?.role).toBe('lead');
    });

    it('should return undefined for non-member', () => {
      const membership = AuthorizationService.checkTeamMembership(
        regularUser.id,
        teamId
      );
      expect(membership).toBeUndefined();
    });
  });

  describe('checkTeamAccess', () => {
    it('should allow admin access to any team', () => {
      const result = AuthorizationService.checkTeamAccess(adminUser, teamId);
      expect(result.authorized).toBe(true);
      expect(result.membership).toBeUndefined();
    });

    it('should allow team member access', () => {
      const result = AuthorizationService.checkTeamAccess(teamMemberUser, teamId);
      expect(result.authorized).toBe(true);
      expect(result.membership).toBeDefined();
      expect(result.membership?.role).toBe('member');
    });

    it('should allow team lead access', () => {
      const result = AuthorizationService.checkTeamAccess(teamLeadUser, teamId);
      expect(result.authorized).toBe(true);
      expect(result.membership).toBeDefined();
      expect(result.membership?.role).toBe('lead');
    });

    it('should deny access to non-member', () => {
      const result = AuthorizationService.checkTeamAccess(regularUser, teamId);
      expect(result.authorized).toBe(false);
      expect(result.error).toBe('Team access required');
      expect(result.statusCode).toBe(403);
    });
  });

  describe('checkTeamLeadAccess', () => {
    it('should allow admin access', () => {
      const result = AuthorizationService.checkTeamLeadAccess(adminUser, teamId);
      expect(result.authorized).toBe(true);
    });

    it('should allow team lead access', () => {
      const result = AuthorizationService.checkTeamLeadAccess(teamLeadUser, teamId);
      expect(result.authorized).toBe(true);
      expect(result.membership?.role).toBe('lead');
    });

    it('should deny access to regular team member', () => {
      const result = AuthorizationService.checkTeamLeadAccess(
        teamMemberUser,
        teamId
      );
      expect(result.authorized).toBe(false);
      expect(result.error).toBe('Team lead access required');
      expect(result.statusCode).toBe(403);
    });

    it('should deny access to non-member', () => {
      const result = AuthorizationService.checkTeamLeadAccess(regularUser, teamId);
      expect(result.authorized).toBe(false);
      expect(result.error).toBe('Team lead access required');
      expect(result.statusCode).toBe(403);
    });
  });

  describe('checkServiceTeamLeadAccess', () => {
    it('should allow admin access', () => {
      const result = AuthorizationService.checkServiceTeamLeadAccess(
        adminUser,
        serviceId
      );
      expect(result.authorized).toBe(true);
    });

    it('should allow team lead access', () => {
      const result = AuthorizationService.checkServiceTeamLeadAccess(
        teamLeadUser,
        serviceId
      );
      expect(result.authorized).toBe(true);
    });

    it('should deny access for non-existent service', () => {
      const result = AuthorizationService.checkServiceTeamLeadAccess(
        teamLeadUser,
        'non-existent-service-id'
      );
      expect(result.authorized).toBe(false);
      expect(result.error).toBe('Service not found');
      expect(result.statusCode).toBe(404);
    });

    it('should deny access to non-lead member', () => {
      const result = AuthorizationService.checkServiceTeamLeadAccess(
        teamMemberUser,
        serviceId
      );
      expect(result.authorized).toBe(false);
      expect(result.error).toBe('Team lead access required');
    });
  });

  describe('checkDependencyTeamAccess', () => {
    let dependencyId: string;

    beforeAll(() => {
      dependencyId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependencies (id, service_id, name, status)
        VALUES (?, ?, ?, ?)
      `).run(dependencyId, serviceId, 'test-dep', 'healthy');
    });

    it('should allow admin access to any dependency', () => {
      const result = AuthorizationService.checkDependencyTeamAccess(adminUser, dependencyId);
      expect(result.authorized).toBe(true);
    });

    it('should allow team member access to own team dependency', () => {
      const result = AuthorizationService.checkDependencyTeamAccess(teamMemberUser, dependencyId);
      expect(result.authorized).toBe(true);
    });

    it('should deny access to non-member', () => {
      const result = AuthorizationService.checkDependencyTeamAccess(regularUser, dependencyId);
      expect(result.authorized).toBe(false);
      expect(result.error).toBe('Team access required');
      expect(result.statusCode).toBe(403);
    });

    it('should return 404 for non-existent dependency', () => {
      const result = AuthorizationService.checkDependencyTeamAccess(teamMemberUser, 'non-existent');
      expect(result.authorized).toBe(false);
      expect(result.error).toBe('Dependency not found');
      expect(result.statusCode).toBe(404);
    });
  });

  describe('checkServiceTeamAccess', () => {
    it('should allow admin access to any service', () => {
      const result = AuthorizationService.checkServiceTeamAccess(adminUser, serviceId);
      expect(result.authorized).toBe(true);
    });

    it('should allow team member access to own team service', () => {
      const result = AuthorizationService.checkServiceTeamAccess(teamMemberUser, serviceId);
      expect(result.authorized).toBe(true);
    });

    it('should deny access to non-member', () => {
      const result = AuthorizationService.checkServiceTeamAccess(regularUser, serviceId);
      expect(result.authorized).toBe(false);
      expect(result.error).toBe('Team access required');
      expect(result.statusCode).toBe(403);
    });

    it('should return 404 for non-existent service', () => {
      const result = AuthorizationService.checkServiceTeamAccess(teamMemberUser, 'non-existent');
      expect(result.authorized).toBe(false);
      expect(result.error).toBe('Service not found');
      expect(result.statusCode).toBe(404);
    });
  });

  describe('checkAdminAccess', () => {
    it('should allow admin access', () => {
      const result = AuthorizationService.checkAdminAccess(adminUser);
      expect(result.authorized).toBe(true);
    });

    it('should deny access to regular user', () => {
      const result = AuthorizationService.checkAdminAccess(regularUser);
      expect(result.authorized).toBe(false);
      expect(result.error).toBe('Admin access required');
      expect(result.statusCode).toBe(403);
    });

    it('should deny access to team lead (non-admin)', () => {
      const result = AuthorizationService.checkAdminAccess(teamLeadUser);
      expect(result.authorized).toBe(false);
      expect(result.error).toBe('Admin access required');
      expect(result.statusCode).toBe(403);
    });
  });
});
