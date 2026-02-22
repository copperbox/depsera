import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

// Create in-memory database for testing
const testDb = new Database(':memory:');

// Mock the db module with both named and default exports
jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

// Mock the auth module to avoid session store initialization
jest.mock('../../auth', () => ({
  requireAuth: jest.fn((_req, _res, next) => next()),
  requireAdmin: jest.fn((_req, _res, next) => next()),
  requireTeamAccess: jest.fn((_req, _res, next) => next()),
  requireTeamLead: jest.fn((_req, _res, next) => next()),
  requireServiceTeamLead: jest.fn((_req, _res, next) => next()),
  requireBodyTeamLead: jest.fn((_req, _res, next) => next()),
}));

import teamsRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/teams', teamsRouter);

describe('Teams API', () => {
  let teamId: string;
  let userId: string;
  let user2Id: string;

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
        polling_interval INTEGER NOT NULL DEFAULT 30,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_poll_success INTEGER,
        last_poll_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT
      )
    `);

    // Create test users
    userId = randomUUID();
    user2Id = randomUUID();

    testDb.prepare(`
      INSERT INTO users (id, email, name, role)
      VALUES (?, ?, ?, ?)
    `).run(userId, 'alice@example.com', 'Alice Johnson', 'user');

    testDb.prepare(`
      INSERT INTO users (id, email, name, role)
      VALUES (?, ?, ?, ?)
    `).run(user2Id, 'bob@example.com', 'Bob Smith', 'user');
  });

  beforeEach(() => {
    // Clear teams, members, and services before each test
    testDb.exec('DELETE FROM services');
    testDb.exec('DELETE FROM team_members');
    testDb.exec('DELETE FROM teams');
  });

  afterAll(() => {
    testDb.close();
  });

  describe('POST /api/teams', () => {
    it('should create a new team with required fields', async () => {
      const response = await request(app)
        .post('/api/teams')
        .send({ name: 'Platform Team' });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Platform Team');
      expect(response.body.description).toBeNull();
      expect(response.body.member_count).toBe(0);
      expect(response.body.service_count).toBe(0);

      teamId = response.body.id;
    });

    it('should create a team with description', async () => {
      const response = await request(app)
        .post('/api/teams')
        .send({
          name: 'Backend Team',
          description: 'Handles backend services',
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Backend Team');
      expect(response.body.description).toBe('Handles backend services');
    });

    it('should reject duplicate team name', async () => {
      await request(app)
        .post('/api/teams')
        .send({ name: 'Duplicate Team' });

      const response = await request(app)
        .post('/api/teams')
        .send({ name: 'Duplicate Team' });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });

    it('should reject missing name', async () => {
      const response = await request(app)
        .post('/api/teams')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('name');
    });

    it('should reject empty name', async () => {
      const response = await request(app)
        .post('/api/teams')
        .send({ name: '   ' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/teams', () => {
    beforeEach(() => {
      // Create test teams
      teamId = randomUUID();
      const team2Id = randomUUID();

      testDb.prepare(`
        INSERT INTO teams (id, name, description)
        VALUES (?, ?, ?)
      `).run(teamId, 'Team Alpha', 'First team');

      testDb.prepare(`
        INSERT INTO teams (id, name, description)
        VALUES (?, ?, ?)
      `).run(team2Id, 'Team Beta', 'Second team');

      // Add members to Team Alpha
      testDb.prepare(`
        INSERT INTO team_members (team_id, user_id, role)
        VALUES (?, ?, ?)
      `).run(teamId, userId, 'lead');

      testDb.prepare(`
        INSERT INTO team_members (team_id, user_id, role)
        VALUES (?, ?, ?)
      `).run(teamId, user2Id, 'member');

      // Add a service to Team Alpha
      testDb.prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint)
        VALUES (?, ?, ?, ?)
      `).run(randomUUID(), 'Test Service', teamId, 'https://example.com/health');
    });

    it('should list all teams with counts', async () => {
      const response = await request(app).get('/api/teams');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);

      const teamAlpha = response.body.find((t: { name: string }) => t.name === 'Team Alpha');
      expect(teamAlpha.member_count).toBe(2);
      expect(teamAlpha.service_count).toBe(1);

      const teamBeta = response.body.find((t: { name: string }) => t.name === 'Team Beta');
      expect(teamBeta.member_count).toBe(0);
      expect(teamBeta.service_count).toBe(0);
    });

    it('should return teams sorted by name', async () => {
      const response = await request(app).get('/api/teams');

      expect(response.status).toBe(200);
      expect(response.body[0].name).toBe('Team Alpha');
      expect(response.body[1].name).toBe('Team Beta');
    });
  });

  describe('GET /api/teams/:id', () => {
    beforeEach(() => {
      teamId = randomUUID();

      testDb.prepare(`
        INSERT INTO teams (id, name, description)
        VALUES (?, ?, ?)
      `).run(teamId, 'Detail Team', 'A team with details');

      // Add members
      testDb.prepare(`
        INSERT INTO team_members (team_id, user_id, role)
        VALUES (?, ?, ?)
      `).run(teamId, userId, 'lead');

      // Add service
      testDb.prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint)
        VALUES (?, ?, ?, ?)
      `).run(randomUUID(), 'Detail Service', teamId, 'https://example.com/health');
    });

    it('should return team with members and services', async () => {
      const response = await request(app).get(`/api/teams/${teamId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(teamId);
      expect(response.body.name).toBe('Detail Team');
      expect(response.body.members).toHaveLength(1);
      expect(response.body.members[0].role).toBe('lead');
      expect(response.body.members[0].user.name).toBe('Alice Johnson');
      expect(response.body.services).toHaveLength(1);
      expect(response.body.services[0].name).toBe('Detail Service');
    });

    it('should return 404 for non-existent team', async () => {
      const response = await request(app).get(`/api/teams/${randomUUID()}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Team not found');
    });
  });

  describe('PUT /api/teams/:id', () => {
    beforeEach(() => {
      teamId = randomUUID();

      testDb.prepare(`
        INSERT INTO teams (id, name, description)
        VALUES (?, ?, ?)
      `).run(teamId, 'Update Team', 'Original description');
    });

    it('should update team name', async () => {
      const response = await request(app)
        .put(`/api/teams/${teamId}`)
        .send({ name: 'Updated Team' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Team');
    });

    it('should update team description', async () => {
      const response = await request(app)
        .put(`/api/teams/${teamId}`)
        .send({ description: 'New description' });

      expect(response.status).toBe(200);
      expect(response.body.description).toBe('New description');
    });

    it('should clear description with null', async () => {
      const response = await request(app)
        .put(`/api/teams/${teamId}`)
        .send({ description: null });

      expect(response.status).toBe(200);
      expect(response.body.description).toBeNull();
    });

    it('should reject duplicate name on update', async () => {
      // Create another team
      testDb.prepare(`
        INSERT INTO teams (id, name, description)
        VALUES (?, ?, ?)
      `).run(randomUUID(), 'Other Team', null);

      const response = await request(app)
        .put(`/api/teams/${teamId}`)
        .send({ name: 'Other Team' });

      expect(response.status).toBe(409);
    });

    it('should return 404 for non-existent team', async () => {
      const response = await request(app)
        .put(`/api/teams/${randomUUID()}`)
        .send({ name: 'Ghost' });

      expect(response.status).toBe(404);
    });

    it('should reject empty update', async () => {
      const response = await request(app)
        .put(`/api/teams/${teamId}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/teams/:id', () => {
    beforeEach(() => {
      teamId = randomUUID();

      testDb.prepare(`
        INSERT INTO teams (id, name, description)
        VALUES (?, ?, ?)
      `).run(teamId, 'Delete Team', null);

      // Add a member
      testDb.prepare(`
        INSERT INTO team_members (team_id, user_id, role)
        VALUES (?, ?, ?)
      `).run(teamId, userId, 'member');
    });

    it('should delete team without services', async () => {
      const response = await request(app).delete(`/api/teams/${teamId}`);

      expect(response.status).toBe(204);

      // Verify team is deleted
      const team = testDb.prepare('SELECT * FROM teams WHERE id = ?').get(teamId);
      expect(team).toBeUndefined();

      // Verify members are also deleted (cascade)
      const members = testDb.prepare('SELECT * FROM team_members WHERE team_id = ?').all(teamId);
      expect(members).toHaveLength(0);
    });

    it('should reject deletion when team has services', async () => {
      // Add a service
      testDb.prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint)
        VALUES (?, ?, ?, ?)
      `).run(randomUUID(), 'Blocker Service', teamId, 'https://example.com/health');

      const response = await request(app).delete(`/api/teams/${teamId}`);

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('existing services');
      expect(response.body.service_count).toBe(1);
    });

    it('should return 404 for non-existent team', async () => {
      const response = await request(app).delete(`/api/teams/${randomUUID()}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/teams/:id/members', () => {
    beforeEach(() => {
      teamId = randomUUID();

      testDb.prepare(`
        INSERT INTO teams (id, name, description)
        VALUES (?, ?, ?)
      `).run(teamId, 'Member Team', null);
    });

    it('should add a member with default role', async () => {
      const response = await request(app)
        .post(`/api/teams/${teamId}/members`)
        .send({ user_id: userId });

      expect(response.status).toBe(201);
      expect(response.body.team_id).toBe(teamId);
      expect(response.body.user_id).toBe(userId);
      expect(response.body.role).toBe('member');
      expect(response.body.user.name).toBe('Alice Johnson');
    });

    it('should add a member with lead role', async () => {
      const response = await request(app)
        .post(`/api/teams/${teamId}/members`)
        .send({ user_id: userId, role: 'lead' });

      expect(response.status).toBe(201);
      expect(response.body.role).toBe('lead');
    });

    it('should reject invalid role', async () => {
      const response = await request(app)
        .post(`/api/teams/${teamId}/members`)
        .send({ user_id: userId, role: 'admin' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('role');
    });

    it('should reject duplicate membership', async () => {
      await request(app)
        .post(`/api/teams/${teamId}/members`)
        .send({ user_id: userId });

      const response = await request(app)
        .post(`/api/teams/${teamId}/members`)
        .send({ user_id: userId });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already a member');
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post(`/api/teams/${teamId}/members`)
        .send({ user_id: randomUUID() });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('User not found');
    });

    it('should return 404 for non-existent team', async () => {
      const response = await request(app)
        .post(`/api/teams/${randomUUID()}/members`)
        .send({ user_id: userId });

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/teams/:id/members/:userId', () => {
    beforeEach(() => {
      teamId = randomUUID();

      testDb.prepare(`
        INSERT INTO teams (id, name, description)
        VALUES (?, ?, ?)
      `).run(teamId, 'Role Team', null);

      testDb.prepare(`
        INSERT INTO team_members (team_id, user_id, role)
        VALUES (?, ?, ?)
      `).run(teamId, userId, 'member');
    });

    it('should update member role', async () => {
      const response = await request(app)
        .put(`/api/teams/${teamId}/members/${userId}`)
        .send({ role: 'lead' });

      expect(response.status).toBe(200);
      expect(response.body.role).toBe('lead');
      expect(response.body.user.name).toBe('Alice Johnson');
    });

    it('should reject invalid role', async () => {
      const response = await request(app)
        .put(`/api/teams/${teamId}/members/${userId}`)
        .send({ role: 'superadmin' });

      expect(response.status).toBe(400);
    });

    it('should reject missing role', async () => {
      const response = await request(app)
        .put(`/api/teams/${teamId}/members/${userId}`)
        .send({});

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent membership', async () => {
      const response = await request(app)
        .put(`/api/teams/${teamId}/members/${user2Id}`)
        .send({ role: 'lead' });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Team member not found');
    });

    it('should return 404 for non-existent team', async () => {
      const response = await request(app)
        .put(`/api/teams/${randomUUID()}/members/${userId}`)
        .send({ role: 'lead' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/teams/:id/members/:userId', () => {
    beforeEach(() => {
      teamId = randomUUID();

      testDb.prepare(`
        INSERT INTO teams (id, name, description)
        VALUES (?, ?, ?)
      `).run(teamId, 'Remove Team', null);

      testDb.prepare(`
        INSERT INTO team_members (team_id, user_id, role)
        VALUES (?, ?, ?)
      `).run(teamId, userId, 'member');
    });

    it('should remove member from team', async () => {
      const response = await request(app)
        .delete(`/api/teams/${teamId}/members/${userId}`);

      expect(response.status).toBe(204);

      // Verify member is removed
      const member = testDb
        .prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?')
        .get(teamId, userId);
      expect(member).toBeUndefined();
    });

    it('should return 404 for non-existent membership', async () => {
      const response = await request(app)
        .delete(`/api/teams/${teamId}/members/${user2Id}`);

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent team', async () => {
      const response = await request(app)
        .delete(`/api/teams/${randomUUID()}/members/${userId}`);

      expect(response.status).toBe(404);
    });
  });
});
