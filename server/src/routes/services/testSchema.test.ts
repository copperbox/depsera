import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { User } from '../../db/types';

// Create in-memory database for testing
const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

// Test users
let currentUser: User;

const adminUser: User = {
  id: 'admin-user-id',
  email: 'admin@test.com',
  name: 'Test Admin',
  oidc_subject: null,
  password_hash: null,
  role: 'admin',
  is_active: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const teamLeadUser: User = {
  id: 'lead-user-id',
  email: 'lead@test.com',
  name: 'Team Lead',
  oidc_subject: null,
  password_hash: null,
  role: 'user',
  is_active: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const memberUser: User = {
  id: 'member-user-id',
  email: 'member@test.com',
  name: 'Team Member',
  oidc_subject: null,
  password_hash: null,
  role: 'user',
  is_active: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

jest.mock('../../auth', () => ({
  requireAuth: jest.fn((req: Request, _res: Response, next: NextFunction) => {
    req.user = currentUser;
    next();
  }),
  requireAdmin: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireTeamAccess: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireTeamLead: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireServiceTeamAccess: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireServiceTeamLead: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireBodyTeamLead: jest.fn((req: Request, _res: Response, next: NextFunction) => {
    req.user = currentUser;
    next();
  }),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock SSRF validation
jest.mock('../../utils/ssrf', () => ({
  validateUrlHostname: jest.fn(),
  validateUrlNotPrivate: jest.fn().mockResolvedValue(undefined),
}));

import servicesRouter from './index';
import { validateUrlHostname, validateUrlNotPrivate } from '../../utils/ssrf';

const app = express();
app.use(express.json());
app.use('/api/services', servicesRouter);

describe('POST /api/services/test-schema', () => {
  let teamId: string;

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

    // Insert test users
    testDb.prepare('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)').run(
      adminUser.id, adminUser.email, adminUser.name, adminUser.role
    );
    testDb.prepare('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)').run(
      teamLeadUser.id, teamLeadUser.email, teamLeadUser.name, teamLeadUser.role
    );
    testDb.prepare('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)').run(
      memberUser.id, memberUser.email, memberUser.name, memberUser.role
    );

    // Create team
    teamId = randomUUID();
    testDb.prepare('INSERT INTO teams (id, name) VALUES (?, ?)').run(teamId, 'Test Team');

    // Add lead and member
    testDb.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(
      teamId, teamLeadUser.id, 'lead'
    );
    testDb.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(
      teamId, memberUser.id, 'member'
    );
  });

  beforeEach(() => {
    currentUser = adminUser;
    mockFetch.mockReset();
    (validateUrlHostname as jest.Mock).mockReset();
    (validateUrlNotPrivate as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  const validSchemaConfig = {
    root: 'checks',
    fields: {
      name: 'checkName',
      healthy: { field: 'status', equals: 'ok' },
    },
  };

  const validUrl = 'https://example.com/health';

  const mockHealthResponse = {
    checks: [
      { checkName: 'database', status: 'ok', responseTime: 12 },
      { checkName: 'cache', status: 'error', responseTime: 0 },
    ],
  };

  // --- Authorization tests ---

  it('should allow admin users', async () => {
    currentUser = adminUser;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockHealthResponse,
    });

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: validSchemaConfig });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('should allow team lead users', async () => {
    currentUser = teamLeadUser;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockHealthResponse,
    });

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: validSchemaConfig });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('should reject regular team members (not lead)', async () => {
    currentUser = memberUser;

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: validSchemaConfig });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/team lead or admin/i);
  });

  // --- Validation tests ---

  it('should reject missing url', async () => {
    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ schema_config: validSchemaConfig });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/url is required/i);
  });

  it('should reject invalid url format', async () => {
    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: 'not-a-url', schema_config: validSchemaConfig });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/valid URL/i);
  });

  it('should reject missing schema_config', async () => {
    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/schema_config is required/i);
  });

  it('should reject invalid schema_config structure', async () => {
    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: { root: 'checks' } });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/schema_config/i);
  });

  // --- SSRF tests ---

  it('should reject SSRF-blocked hostname', async () => {
    (validateUrlHostname as jest.Mock).mockImplementation(() => {
      throw new Error('Blocked hostname: localhost');
    });

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: 'https://localhost/health', schema_config: validSchemaConfig });

    expect(response.status).toBe(500);
    expect(validateUrlHostname).toHaveBeenCalledWith('https://localhost/health');
  });

  it('should reject SSRF-blocked resolved IP', async () => {
    (validateUrlNotPrivate as jest.Mock).mockRejectedValue(
      new Error('Hostname resolved to blocked private IP')
    );

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: validSchemaConfig });

    expect(response.status).toBe(500);
    expect(validateUrlNotPrivate).toHaveBeenCalledWith(validUrl);
  });

  // --- Successful parsing tests ---

  it('should parse a valid health endpoint with schema mapping', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockHealthResponse,
    });

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: validSchemaConfig });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.dependencies).toHaveLength(2);
    expect(response.body.dependencies[0]).toEqual({
      name: 'database',
      healthy: true,
      latency_ms: 0,
      impact: null,
      description: null,
      check_details: null,
      contact: null,
      type: 'other',
      skipped: false,
    });
    expect(response.body.dependencies[1]).toEqual({
      name: 'cache',
      healthy: false,
      latency_ms: 0,
      impact: null,
      description: null,
      check_details: null,
      contact: null,
      type: 'other',
      skipped: false,
    });
  });

  it('should include latency when mapping is configured', async () => {
    const schemaWithLatency = {
      root: 'checks',
      fields: {
        name: 'checkName',
        healthy: { field: 'status', equals: 'ok' },
        latency: 'responseTime',
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockHealthResponse,
    });

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: schemaWithLatency });

    expect(response.status).toBe(200);
    expect(response.body.dependencies[0].latency_ms).toBe(12);
  });

  it('should include warnings for missing optional field mappings', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockHealthResponse,
    });

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: validSchemaConfig });

    expect(response.body.warnings).toContain(
      'No latency field mapping configured — latency data will not be captured'
    );
    expect(response.body.warnings).toContain(
      'No impact field mapping configured — impact data will not be captured'
    );
    expect(response.body.warnings).toContain(
      'No description field mapping configured — description data will not be captured'
    );
    expect(response.body.warnings).toContain(
      'No checkDetails field mapping configured — check details data will not be captured'
    );
    expect(response.body.warnings).toContain(
      'No contact field mapping configured — contact data will not be captured'
    );
  });

  it('should include check_details in response when checkDetails is mapped', async () => {
    const schemaWithCheckDetails = {
      root: 'checks',
      fields: {
        name: 'checkName',
        healthy: { field: 'status', equals: 'ok' },
        checkDetails: 'details',
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        checks: [
          { checkName: 'database', status: 'ok', details: { type: 'postgres', version: '15' } },
          { checkName: 'cache', status: 'error', details: { type: 'redis' } },
        ],
      }),
    });

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: schemaWithCheckDetails });

    expect(response.status).toBe(200);
    expect(response.body.dependencies[0].check_details).toEqual({ type: 'postgres', version: '15' });
    expect(response.body.dependencies[1].check_details).toEqual({ type: 'redis' });
  });

  it('should include contact in response when contact is mapped', async () => {
    const schemaWithContact = {
      root: 'checks',
      fields: {
        name: 'checkName',
        healthy: { field: 'status', equals: 'ok' },
        contact: 'contactInfo',
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        checks: [
          { checkName: 'database', status: 'ok', contactInfo: { email: 'db@test.com', slack: '#db' } },
          { checkName: 'cache', status: 'error', contactInfo: { email: 'cache@test.com' } },
          { checkName: 'api', status: 'ok' },
        ],
      }),
    });

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: schemaWithContact });

    expect(response.status).toBe(200);
    expect(response.body.dependencies[0].contact).toEqual({ email: 'db@test.com', slack: '#db' });
    expect(response.body.dependencies[1].contact).toEqual({ email: 'cache@test.com' });
    expect(response.body.dependencies[2].contact).toBeNull();
  });

  it('should warn when no dependencies are parsed', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ checks: [] }),
    });

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: validSchemaConfig });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.dependencies).toHaveLength(0);
    expect(response.body.warnings).toContain('No dependencies were parsed from the response');
  });

  // --- Error handling tests ---

  it('should handle non-200 HTTP response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
    });

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: validSchemaConfig });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/HTTP 503/);
  });

  it('should handle fetch network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: validSchemaConfig });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Failed to fetch/);
  });

  it('should handle schema mapping parse failure gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ checks: 'not-an-array' }),
    });

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: validSchemaConfig });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.dependencies).toHaveLength(0);
    expect(response.body.warnings).toHaveLength(1);
    expect(response.body.warnings[0]).toMatch(/root path/i);
  });

  it('should accept schema_config as JSON string', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockHealthResponse,
    });

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: JSON.stringify(validSchemaConfig) });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.dependencies).toHaveLength(2);
  });

  it('should handle timeout (abort)', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: validSchemaConfig });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/timed out/i);
  });

  it('should handle nested root path', async () => {
    const nestedSchema = {
      root: 'data.healthChecks',
      fields: {
        name: 'service',
        healthy: 'isHealthy',
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          healthChecks: [
            { service: 'api', isHealthy: true },
            { service: 'db', isHealthy: false },
          ],
        },
      }),
    });

    const response = await request(app)
      .post('/api/services/test-schema')
      .send({ url: validUrl, schema_config: nestedSchema });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.dependencies).toHaveLength(2);
    expect(response.body.dependencies[0].name).toBe('api');
    expect(response.body.dependencies[0].healthy).toBe(true);
    expect(response.body.dependencies[1].name).toBe('db');
    expect(response.body.dependencies[1].healthy).toBe(false);
  });
});
