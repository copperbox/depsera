import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

jest.mock('../../auth', () => ({
  requireAuth: jest.fn((_req, _res, next) => next()),
  requireAdmin: jest.fn((_req, _res, next) => next()),
}));

import usersRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/users', usersRouter);

describe('Users API', () => {
  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        oidc_subject TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        picture TEXT,
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
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (team_id, user_id)
      );

      INSERT INTO users (id, oidc_subject, email, name, role, is_active) VALUES
        ('user-1', 'oidc-1', 'admin@example.com', 'Admin User', 'admin', 1),
        ('user-2', 'oidc-2', 'user@example.com', 'Regular User', 'user', 1),
        ('user-3', 'oidc-3', 'inactive@example.com', 'Inactive User', 'user', 0);

      INSERT INTO teams (id, name) VALUES ('team-1', 'Test Team');
      INSERT INTO team_members (id, team_id, user_id, role) VALUES
        ('tm-1', 'team-1', 'user-1', 'lead'),
        ('tm-2', 'team-1', 'user-2', 'member');
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/users', () => {
    it('should return list of users', async () => {
      const response = await request(app).get('/api/users');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(3);
    });
  });

  describe('GET /api/users/me', () => {
    it('should return current user profile with x-user-id header', async () => {
      const response = await request(app)
        .get('/api/users/me')
        .set('x-user-id', 'user-1');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('user-1');
      expect(response.body.email).toBe('admin@example.com');
      expect(response.body.teams).toBeDefined();
      expect(response.body.permissions).toBeDefined();
      expect(response.body.permissions.canManageUsers).toBe(true);
    });

    it('should fallback to admin user when no x-user-id', async () => {
      const response = await request(app).get('/api/users/me');

      expect(response.status).toBe(200);
      expect(response.body.role).toBe('admin');
    });

    it('should return 401 when no admin exists and no x-user-id', async () => {
      // Temporarily deactivate all admins
      testDb.exec("UPDATE users SET is_active = 0 WHERE role = 'admin'");

      const response = await request(app).get('/api/users/me');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Not authenticated');

      // Restore admin
      testDb.exec("UPDATE users SET is_active = 1 WHERE id = 'user-1'");
    });

    it('should include team lead permissions', async () => {
      const response = await request(app)
        .get('/api/users/me')
        .set('x-user-id', 'user-1');

      expect(response.body.permissions.canManageServices).toBe(true);
    });

    it('should have limited permissions for regular users', async () => {
      const response = await request(app)
        .get('/api/users/me')
        .set('x-user-id', 'user-2');

      expect(response.status).toBe(200);
      expect(response.body.permissions.canManageUsers).toBe(false);
      expect(response.body.permissions.canManageTeams).toBe(false);
    });
  });

  describe('GET /api/users/:id', () => {
    it('should return user by id', async () => {
      const response = await request(app).get('/api/users/user-1');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('user-1');
      expect(response.body.teams).toBeDefined();
      expect(Array.isArray(response.body.teams)).toBe(true);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app).get('/api/users/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });

    it('should include team information', async () => {
      const response = await request(app).get('/api/users/user-1');

      expect(response.body.teams.length).toBeGreaterThan(0);
      expect(response.body.teams[0].team).toBeDefined();
      expect(response.body.teams[0].team.name).toBe('Test Team');
    });
  });

  describe('PUT /api/users/:id/role', () => {
    it('should update user role', async () => {
      // Add another admin first so we can demote
      testDb.exec(`
        INSERT INTO users (id, oidc_subject, email, name, role, is_active)
        VALUES ('user-4', 'oidc-4', 'admin2@example.com', 'Admin 2', 'admin', 1)
      `);

      const response = await request(app)
        .put('/api/users/user-4/role')
        .send({ role: 'user' });

      expect(response.status).toBe(200);
      expect(response.body.role).toBe('user');

      // Clean up
      testDb.exec("DELETE FROM users WHERE id = 'user-4'");
    });

    it('should return 400 for invalid role', async () => {
      const response = await request(app)
        .put('/api/users/user-2/role')
        .send({ role: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('role must be one of');
    });

    it('should return 400 for missing role', async () => {
      const response = await request(app)
        .put('/api/users/user-2/role')
        .send({});

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .put('/api/users/non-existent/role')
        .send({ role: 'admin' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });

    it('should prevent demoting the last admin', async () => {
      const response = await request(app)
        .put('/api/users/user-1/role')
        .send({ role: 'user' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Cannot demote the last admin user');
    });

    it('should allow promoting user to admin', async () => {
      const response = await request(app)
        .put('/api/users/user-2/role')
        .send({ role: 'admin' });

      expect(response.status).toBe(200);
      expect(response.body.role).toBe('admin');

      // Reset back
      testDb.exec("UPDATE users SET role = 'user' WHERE id = 'user-2'");
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('should deactivate user', async () => {
      // Create a user to deactivate
      testDb.exec(`
        INSERT INTO users (id, oidc_subject, email, name, role, is_active)
        VALUES ('user-5', 'oidc-5', 'deactivate@example.com', 'To Deactivate', 'user', 1)
      `);

      const response = await request(app).delete('/api/users/user-5');

      expect(response.status).toBe(204);

      // Verify deactivation
      const user = testDb.prepare('SELECT * FROM users WHERE id = ?').get('user-5') as { is_active: number };
      expect(user.is_active).toBe(0);

      // Clean up
      testDb.exec("DELETE FROM users WHERE id = 'user-5'");
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app).delete('/api/users/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });

    it('should prevent deactivating the last admin', async () => {
      const response = await request(app).delete('/api/users/user-1');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Cannot deactivate the last admin user');
    });

    it('should remove team memberships when deactivating', async () => {
      // Create a user with team membership
      testDb.exec(`
        INSERT INTO users (id, oidc_subject, email, name, role, is_active)
        VALUES ('user-6', 'oidc-6', 'member@example.com', 'Team Member', 'user', 1);
        INSERT INTO team_members (id, team_id, user_id, role)
        VALUES ('tm-6', 'team-1', 'user-6', 'member');
      `);

      await request(app).delete('/api/users/user-6');

      // Verify membership removed
      const membership = testDb.prepare('SELECT * FROM team_members WHERE user_id = ?').get('user-6');
      expect(membership).toBeUndefined();

      // Clean up
      testDb.exec("DELETE FROM users WHERE id = 'user-6'");
    });
  });

  describe('POST /api/users/:id/reactivate', () => {
    it('should reactivate user', async () => {
      const response = await request(app).post('/api/users/user-3/reactivate');

      expect(response.status).toBe(200);
      expect(response.body.is_active).toBeTruthy();

      // Reset back
      testDb.exec("UPDATE users SET is_active = 0 WHERE id = 'user-3'");
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app).post('/api/users/non-existent/reactivate');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });

    it('should return 400 if user is already active', async () => {
      const response = await request(app).post('/api/users/user-2/reactivate');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('User is already active');
    });
  });
});
