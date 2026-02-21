import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

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

// Mock the AssociationMatcher
const mockGetPendingSuggestions = jest.fn();
const mockAcceptSuggestion = jest.fn();
const mockDismissSuggestion = jest.fn();
const mockGenerateSuggestions = jest.fn();
const mockGenerateSuggestionsForService = jest.fn();

jest.mock('../../services/matching', () => ({
  AssociationMatcher: {
    getInstance: () => ({
      getPendingSuggestions: mockGetPendingSuggestions,
      acceptSuggestion: mockAcceptSuggestion,
      dismissSuggestion: mockDismissSuggestion,
      generateSuggestions: mockGenerateSuggestions,
      generateSuggestionsForService: mockGenerateSuggestionsForService,
    }),
  },
}));

import associationsRouter from './index';

// Admin user used for all existing tests (authorization checks pass for admin)
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
// Set req.user to admin for all requests (handlers now require it for authorization)
app.use((req, _res, next) => {
  req.user = adminUser;
  next();
});
// Mount at /api since the router defines the full paths
app.use('/api', associationsRouter);

describe('Associations API', () => {
  let teamId: string;
  let serviceId: string;
  let linkedServiceId: string;
  let dependencyId: string;
  let associationId: string;

  beforeAll(() => {
    // Enable foreign keys
    testDb.pragma('foreign_keys = ON');

    // Create tables
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
    // Clear tables
    testDb.exec('DELETE FROM dependency_associations');
    testDb.exec('DELETE FROM dependencies');
    testDb.exec('DELETE FROM services');
    testDb.exec('DELETE FROM teams');

    // Reset mocks
    jest.clearAllMocks();

    // Create test team
    teamId = randomUUID();
    testDb.prepare(`
      INSERT INTO teams (id, name, description)
      VALUES (?, ?, ?)
    `).run(teamId, 'Test Team', 'A test team');

    // Create services
    serviceId = randomUUID();
    linkedServiceId = randomUUID();

    testDb.prepare(`
      INSERT INTO services (id, name, team_id, health_endpoint)
      VALUES (?, ?, ?, ?)
    `).run(serviceId, 'Source Service', teamId, 'https://source.example.com/health');

    testDb.prepare(`
      INSERT INTO services (id, name, team_id, health_endpoint)
      VALUES (?, ?, ?, ?)
    `).run(linkedServiceId, 'Linked Service', teamId, 'https://linked.example.com/health');

    // Create dependency
    dependencyId = randomUUID();
    testDb.prepare(`
      INSERT INTO dependencies (id, service_id, name, status)
      VALUES (?, ?, ?, ?)
    `).run(dependencyId, serviceId, 'test-dependency', 'healthy');
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/dependencies/:dependencyId/associations', () => {
    it('should return 404 for non-existent dependency', async () => {
      const response = await request(app)
        .get(`/api/dependencies/non-existent-id/associations`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Dependency not found');
    });

    it('should return empty array when no associations', async () => {
      const response = await request(app)
        .get(`/api/dependencies/${dependencyId}/associations`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return associations with linked service', async () => {
      // Create an association
      associationId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_auto_suggested, is_dismissed)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(associationId, dependencyId, linkedServiceId, 'api_call', 0, 0);

      const response = await request(app)
        .get(`/api/dependencies/${dependencyId}/associations`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].linked_service).toBeDefined();
      expect(response.body[0].linked_service.id).toBe(linkedServiceId);
    });

    it('should filter out dismissed associations', async () => {
      // Create a dismissed association
      associationId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_auto_suggested, is_dismissed)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(associationId, dependencyId, linkedServiceId, 'api_call', 0, 1);

      const response = await request(app)
        .get(`/api/dependencies/${dependencyId}/associations`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(0);
    });
  });

  describe('POST /api/dependencies/:dependencyId/associations', () => {
    it('should return 404 for non-existent dependency', async () => {
      const response = await request(app)
        .post(`/api/dependencies/non-existent-id/associations`)
        .send({
          linked_service_id: linkedServiceId,
          association_type: 'api_call',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Dependency');
    });

    it('should return 400 for non-existent linked service', async () => {
      const response = await request(app)
        .post(`/api/dependencies/${dependencyId}/associations`)
        .send({
          linked_service_id: 'non-existent-service',
          association_type: 'api_call',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Linked service not found');
    });

    it('should return 400 when linking to own service', async () => {
      const response = await request(app)
        .post(`/api/dependencies/${dependencyId}/associations`)
        .send({
          linked_service_id: serviceId,
          association_type: 'api_call',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('own service');
    });

    it('should create a new association', async () => {
      const response = await request(app)
        .post(`/api/dependencies/${dependencyId}/associations`)
        .send({
          linked_service_id: linkedServiceId,
          association_type: 'api_call',
        });

      expect(response.status).toBe(201);
      expect(response.body.dependency_id).toBe(dependencyId);
      expect(response.body.linked_service_id).toBe(linkedServiceId);
      expect(response.body.linked_service).toBeDefined();
    });

    it('should return 409 for duplicate association', async () => {
      // Create existing association
      associationId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type)
        VALUES (?, ?, ?, ?)
      `).run(associationId, dependencyId, linkedServiceId, 'api_call');

      const response = await request(app)
        .post(`/api/dependencies/${dependencyId}/associations`)
        .send({
          linked_service_id: linkedServiceId,
          association_type: 'api_call',
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });

    it('should reactivate dismissed association', async () => {
      // Create dismissed association
      associationId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_dismissed)
        VALUES (?, ?, ?, ?, ?)
      `).run(associationId, dependencyId, linkedServiceId, 'api_call', 1);

      const response = await request(app)
        .post(`/api/dependencies/${dependencyId}/associations`)
        .send({
          linked_service_id: linkedServiceId,
          association_type: 'database',
        });

      expect(response.status).toBe(200);
      expect(response.body.is_dismissed).toBe(0);
      expect(response.body.association_type).toBe('database');
    });
  });

  describe('DELETE /api/dependencies/:dependencyId/associations/:serviceId', () => {
    it('should return 404 for non-existent dependency', async () => {
      const response = await request(app)
        .delete(`/api/dependencies/non-existent-id/associations/${linkedServiceId}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Dependency not found');
    });

    it('should return 404 for non-existent association', async () => {
      const response = await request(app)
        .delete(`/api/dependencies/${dependencyId}/associations/${linkedServiceId}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Association not found');
    });

    it('should delete existing association', async () => {
      // Create association
      associationId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type)
        VALUES (?, ?, ?, ?)
      `).run(associationId, dependencyId, linkedServiceId, 'api_call');

      const response = await request(app)
        .delete(`/api/dependencies/${dependencyId}/associations/${linkedServiceId}`);

      expect(response.status).toBe(204);

      // Verify deletion
      const remaining = testDb.prepare(`
        SELECT * FROM dependency_associations WHERE id = ?
      `).get(associationId);
      expect(remaining).toBeUndefined();
    });
  });

  describe('GET /api/associations/suggestions', () => {
    it('should return pending suggestions', async () => {
      const mockSuggestions = [
        { id: '1', dependency_id: dependencyId, linked_service_id: linkedServiceId },
      ];
      mockGetPendingSuggestions.mockReturnValue(mockSuggestions);

      const response = await request(app)
        .get('/api/associations/suggestions');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSuggestions);
    });

    it('should return 500 on error', async () => {
      mockGetPendingSuggestions.mockImplementation(() => {
        throw new Error('Database error');
      });

      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const response = await request(app)
        .get('/api/associations/suggestions');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error');

      errorSpy.mockRestore();
    });
  });

  describe('POST /api/associations/suggestions/:suggestionId/accept', () => {
    beforeEach(() => {
      // Create an auto-suggested association
      associationId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_auto_suggested)
        VALUES (?, ?, ?, ?, ?)
      `).run(associationId, dependencyId, linkedServiceId, 'api_call', 1);
    });

    it('should return 404 for non-existent suggestion', async () => {
      const response = await request(app)
        .post('/api/associations/suggestions/non-existent-id/accept');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    it('should return 404 for non-auto-suggested association', async () => {
      // First delete the existing auto-suggested one to avoid unique constraint
      testDb.prepare('DELETE FROM dependency_associations WHERE id = ?').run(associationId);

      // Create a manual association
      const manualId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_auto_suggested)
        VALUES (?, ?, ?, ?, ?)
      `).run(manualId, dependencyId, linkedServiceId, 'api_call', 0);

      const response = await request(app)
        .post(`/api/associations/suggestions/${manualId}/accept`);

      expect(response.status).toBe(404);
    });

    it('should accept suggestion successfully', async () => {
      mockAcceptSuggestion.mockReturnValue(true);

      const response = await request(app)
        .post(`/api/associations/suggestions/${associationId}/accept`);

      expect(response.status).toBe(200);
      expect(response.body.linked_service).toBeDefined();
    });

    it('should return 500 when accept fails', async () => {
      mockAcceptSuggestion.mockReturnValue(false);

      const response = await request(app)
        .post(`/api/associations/suggestions/${associationId}/accept`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to accept suggestion');
    });

    it('should return 500 on error', async () => {
      mockAcceptSuggestion.mockImplementation(() => {
        throw new Error('Database error');
      });

      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const response = await request(app)
        .post(`/api/associations/suggestions/${associationId}/accept`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error');
      expect(response.body.message).toBeUndefined();

      errorSpy.mockRestore();
    });
  });

  describe('POST /api/associations/suggestions/:suggestionId/dismiss', () => {
    beforeEach(() => {
      // Create an auto-suggested association
      associationId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_auto_suggested)
        VALUES (?, ?, ?, ?, ?)
      `).run(associationId, dependencyId, linkedServiceId, 'api_call', 1);
    });

    it('should return 404 for non-existent suggestion', async () => {
      const response = await request(app)
        .post('/api/associations/suggestions/non-existent-id/dismiss');

      expect(response.status).toBe(404);
    });

    it('should dismiss suggestion successfully', async () => {
      mockDismissSuggestion.mockReturnValue(true);

      const response = await request(app)
        .post(`/api/associations/suggestions/${associationId}/dismiss`);

      expect(response.status).toBe(204);
    });

    it('should return 500 when dismiss fails', async () => {
      mockDismissSuggestion.mockReturnValue(false);

      const response = await request(app)
        .post(`/api/associations/suggestions/${associationId}/dismiss`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to dismiss suggestion');
    });

    it('should return 500 on error', async () => {
      mockDismissSuggestion.mockImplementation(() => {
        throw new Error('Database error');
      });

      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const response = await request(app)
        .post(`/api/associations/suggestions/${associationId}/dismiss`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error');
      expect(response.body.message).toBeUndefined();

      errorSpy.mockRestore();
    });
  });

  describe('POST /api/dependencies/:dependencyId/generate-suggestions', () => {
    it('should return 404 for non-existent dependency', async () => {
      const response = await request(app)
        .post('/api/dependencies/non-existent-id/suggestions/generate');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Dependency not found');
    });

    it('should generate suggestions for dependency', async () => {
      const mockSuggestions = [{ id: '1', linked_service_id: linkedServiceId }];
      mockGenerateSuggestions.mockReturnValue(mockSuggestions);

      const response = await request(app)
        .post(`/api/dependencies/${dependencyId}/suggestions/generate`);

      expect(response.status).toBe(200);
      expect(response.body.dependency_id).toBe(dependencyId);
      expect(response.body.suggestions_created).toBe(1);
      expect(response.body.suggestions).toEqual(mockSuggestions);
    });

    it('should return 500 on error', async () => {
      mockGenerateSuggestions.mockImplementation(() => {
        throw new Error('Generation failed');
      });

      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const response = await request(app)
        .post(`/api/dependencies/${dependencyId}/suggestions/generate`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error');

      errorSpy.mockRestore();
    });
  });

  describe('POST /api/services/:serviceId/suggestions/generate', () => {
    it('should return 404 for non-existent service', async () => {
      const response = await request(app)
        .post('/api/services/non-existent-id/suggestions/generate');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Service not found');
    });

    it('should generate suggestions for service', async () => {
      const mockSuggestions = [{ id: '1', dependency_id: dependencyId }];
      mockGenerateSuggestionsForService.mockReturnValue(mockSuggestions);

      const response = await request(app)
        .post(`/api/services/${serviceId}/suggestions/generate`);

      expect(response.status).toBe(200);
      expect(response.body.service_id).toBe(serviceId);
      expect(response.body.suggestions_created).toBe(1);
      expect(response.body.suggestions).toEqual(mockSuggestions);
    });

    it('should return 500 on error', async () => {
      mockGenerateSuggestionsForService.mockImplementation(() => {
        throw new Error('Generation failed');
      });

      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const response = await request(app)
        .post(`/api/services/${serviceId}/suggestions/generate`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error');

      errorSpy.mockRestore();
    });
  });
});
