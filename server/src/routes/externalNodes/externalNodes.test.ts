import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

// Create in-memory database for testing
const testDb = new Database(':memory:');

// Mock the db module
jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

// Mock the auth module
jest.mock('../../auth', () => ({
  requireAuth: jest.fn((_req, _res, next) => next()),
  requireAdmin: jest.fn((_req, _res, next) => next()),
  requireTeamAccess: jest.fn((_req, _res, next) => next()),
  requireTeamLead: jest.fn((_req, _res, next) => next()),
  requireServiceTeamLead: jest.fn((_req, _res, next) => next()),
  requireBodyTeamLead: jest.fn((_req, _res, next) => next()),
}));

import { StoreRegistry } from '../../stores';
import externalNodesRouter from './index';

const adminUser = {
  id: 'admin-test-user-id',
  email: 'admin@test.com',
  name: 'Admin',
  oidc_subject: null,
  password_hash: null,
  role: 'admin' as const,
  is_active: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = adminUser;
  next();
});
app.use('/api/external-nodes', externalNodesRouter);

describe('External Nodes API', () => {
  beforeAll(() => {
    testDb.pragma('foreign_keys = ON');

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS external_node_enrichment (
        id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL UNIQUE,
        display_name TEXT,
        description TEXT,
        impact TEXT,
        contact TEXT,
        service_type TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by TEXT,
        FOREIGN KEY (updated_by) REFERENCES users(id)
      )
    `);
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM external_node_enrichment');
    testDb.exec('DELETE FROM users');

    // Insert admin user so FK constraint on updated_by is satisfied
    testDb.prepare('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)')
      .run('admin-test-user-id', 'admin@test.com', 'Admin', 'admin');

    StoreRegistry.resetInstance();
    jest.clearAllMocks();
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/external-nodes', () => {
    it('should return empty array when no enrichments exist', async () => {
      const response = await request(app).get('/api/external-nodes');
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return all enrichment records', async () => {
      // Upsert two enrichments
      await request(app)
        .put('/api/external-nodes/stripe-api')
        .send({ displayName: 'Stripe API', serviceType: 'payment' });

      await request(app)
        .put('/api/external-nodes/postgresql')
        .send({ displayName: 'PostgreSQL', serviceType: 'database' });

      const response = await request(app).get('/api/external-nodes');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });
  });

  describe('PUT /api/external-nodes/:canonicalName', () => {
    it('should create new enrichment', async () => {
      const response = await request(app)
        .put('/api/external-nodes/stripe-api')
        .send({
          displayName: 'Stripe API',
          description: 'Payment gateway',
          impact: 'Revenue-critical',
          serviceType: 'payment',
        });

      expect(response.status).toBe(200);
      expect(response.body.canonical_name).toBe('stripe-api');
      expect(response.body.display_name).toBe('Stripe API');
      expect(response.body.description).toBe('Payment gateway');
      expect(response.body.impact).toBe('Revenue-critical');
      expect(response.body.service_type).toBe('payment');
    });

    it('should update existing enrichment', async () => {
      // Create first
      await request(app)
        .put('/api/external-nodes/stripe-api')
        .send({ displayName: 'Stripe' });

      // Update
      const response = await request(app)
        .put('/api/external-nodes/stripe-api')
        .send({ displayName: 'Stripe API v2', description: 'Updated description' });

      expect(response.status).toBe(200);
      expect(response.body.display_name).toBe('Stripe API v2');
      expect(response.body.description).toBe('Updated description');

      // Verify only one record exists
      const listResponse = await request(app).get('/api/external-nodes');
      expect(listResponse.body).toHaveLength(1);
    });

    it('should handle contact as JSON', async () => {
      const response = await request(app)
        .put('/api/external-nodes/stripe-api')
        .send({
          displayName: 'Stripe API',
          contact: { email: 'ops@example.com', slack: '#payments' },
        });

      expect(response.status).toBe(200);
      expect(response.body.contact).toBeTruthy();
    });
  });

  describe('DELETE /api/external-nodes/:canonicalName', () => {
    it('should delete existing enrichment', async () => {
      // Create enrichment
      await request(app)
        .put('/api/external-nodes/stripe-api')
        .send({ displayName: 'Stripe API' });

      const response = await request(app)
        .delete('/api/external-nodes/stripe-api');

      expect(response.status).toBe(204);

      // Verify deletion
      const listResponse = await request(app).get('/api/external-nodes');
      expect(listResponse.body).toHaveLength(0);
    });

    it('should return 404 for non-existent enrichment', async () => {
      const response = await request(app)
        .delete('/api/external-nodes/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });
});
