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
  requireLocalAuth: jest.fn((_req, _res, next) => next()),
}));

import usersRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/users', usersRouter);

describe('Local User Management API', () => {
  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        oidc_subject TEXT UNIQUE,
        password_hash TEXT,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO users (id, email, name, role, is_active, password_hash) VALUES
        ('admin-1', 'admin@example.com', 'Admin User', 'admin', 1, '$2a$12$dummy'),
        ('user-1', 'existing@example.com', 'Existing User', 'user', 1, '$2a$12$dummy');
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  describe('POST /api/users (create user)', () => {
    afterEach(() => {
      // Clean up any created users
      testDb.exec("DELETE FROM users WHERE id NOT IN ('admin-1', 'user-1')");
    });

    it('should create a new user with valid input', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({
          email: 'newuser@example.com',
          name: 'New User',
          password: 'password123',
          role: 'user',
        });

      expect(response.status).toBe(201);
      expect(response.body.email).toBe('newuser@example.com');
      expect(response.body.name).toBe('New User');
      expect(response.body.role).toBe('user');
      expect(response.body.id).toBeDefined();
      // Should NOT include password_hash in response
      expect(response.body.password_hash).toBeUndefined();
    });

    it('should create a user with admin role', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({
          email: 'newadmin@example.com',
          name: 'New Admin',
          password: 'password123',
          role: 'admin',
        });

      expect(response.status).toBe(201);
      expect(response.body.role).toBe('admin');
    });

    it('should default role to user when not provided', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({
          email: 'defaultrole@example.com',
          name: 'Default Role',
          password: 'password123',
        });

      expect(response.status).toBe(201);
      expect(response.body.role).toBe('user');
    });

    it('should trim email and name', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({
          email: '  trimmed@example.com  ',
          name: '  Trimmed Name  ',
          password: 'password123',
        });

      expect(response.status).toBe(201);
      expect(response.body.email).toBe('trimmed@example.com');
      expect(response.body.name).toBe('Trimmed Name');
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({
          name: 'No Email',
          password: 'password123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('email is required');
    });

    it('should return 400 when email is empty string', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({
          email: '   ',
          name: 'No Email',
          password: 'password123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('email is required');
    });

    it('should return 400 when name is missing', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({
          email: 'noname@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('name is required');
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({
          email: 'nopwd@example.com',
          name: 'No Password',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('password is required');
    });

    it('should return 400 when password is too short', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({
          email: 'shortpwd@example.com',
          name: 'Short Password',
          password: 'short',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('password must be at least 8 characters');
    });

    it('should return 400 for invalid role', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({
          email: 'badrole@example.com',
          name: 'Bad Role',
          password: 'password123',
          role: 'superadmin',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('role must be one of');
    });

    it('should return 409 for duplicate email', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({
          email: 'existing@example.com',
          name: 'Duplicate',
          password: 'password123',
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('A user with this email already exists');
    });

    it('should store password as bcrypt hash', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({
          email: 'hashed@example.com',
          name: 'Hashed',
          password: 'password123',
        });

      expect(response.status).toBe(201);

      // Verify the hash is stored in DB
      const user = testDb.prepare('SELECT password_hash FROM users WHERE id = ?').get(response.body.id) as { password_hash: string };
      expect(user.password_hash).toBeDefined();
      expect(user.password_hash).not.toBe('password123');
      expect(user.password_hash).toMatch(/^\$2[aby]\$/); // bcrypt prefix
    });
  });

  describe('PUT /api/users/:id/password (reset password)', () => {
    it('should reset password for existing user', async () => {
      const response = await request(app)
        .put('/api/users/user-1/password')
        .send({ password: 'newpassword123' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password updated successfully');

      // Verify hash was updated
      const user = testDb.prepare('SELECT password_hash FROM users WHERE id = ?').get('user-1') as { password_hash: string };
      expect(user.password_hash).toMatch(/^\$2[aby]\$/);
      expect(user.password_hash).not.toBe('$2a$12$dummy');
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app)
        .put('/api/users/user-1/password')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('password is required');
    });

    it('should return 400 when password is too short', async () => {
      const response = await request(app)
        .put('/api/users/user-1/password')
        .send({ password: 'short' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('password must be at least 8 characters');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .put('/api/users/non-existent/password')
        .send({ password: 'newpassword123' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });
  });
});
