/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'crypto';

// Create in-memory database for testing
const testDb = new Database(':memory:');

// Mock the db module
jest.mock('../db', () => ({
  db: testDb,
  default: testDb,
}));

import { requireApiKeyAuth } from './apiKeyAuth';

describe('requireApiKeyAuth', () => {
  const teamId = randomUUID();
  const rawKey = 'dps_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyId = randomUUID();

  const createMockRequest = (overrides: Partial<Request> = {}): Request => {
    return {
      headers: {},
      params: {},
      body: {},
      ...overrides,
    } as Request;
  };

  const createMockResponse = (): Response => {
    const res: Partial<Response> = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    return res as Response;
  };

  beforeAll(() => {
    testDb.pragma('foreign_keys = OFF');

    testDb.exec(`
      CREATE TABLE team_api_keys (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        last_used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by TEXT
      );
      CREATE UNIQUE INDEX idx_team_api_keys_key_hash ON team_api_keys(key_hash);
    `);

    testDb
      .prepare(
        `INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(keyId, teamId, 'Test Key', keyHash, rawKey.slice(0, 8));
  });

  afterAll(() => {
    testDb.close();
  });

  it('should authenticate with a valid API key and set apiKeyTeamId', () => {
    const req = createMockRequest({
      headers: { authorization: `Bearer ${rawKey}` },
    } as any);
    const res = createMockResponse();
    const next = jest.fn();

    requireApiKeyAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.apiKeyTeamId).toBe(teamId);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header is missing', () => {
    const req = createMockRequest();
    const res = createMockResponse();
    const next = jest.fn();

    requireApiKeyAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing Authorization header' });
  });

  it('should return 401 for malformed Authorization header (no Bearer)', () => {
    const req = createMockRequest({
      headers: { authorization: `Basic ${rawKey}` },
    } as any);
    const res = createMockResponse();
    const next = jest.fn();

    requireApiKeyAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid Authorization header format' });
  });

  it('should return 401 for key not starting with dps_', () => {
    const req = createMockRequest({
      headers: { authorization: 'Bearer some_random_key' },
    } as any);
    const res = createMockResponse();
    const next = jest.fn();

    requireApiKeyAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid Authorization header format' });
  });

  it('should return 401 for invalid API key (not in DB)', () => {
    const req = createMockRequest({
      headers: { authorization: 'Bearer dps_00000000000000000000000000000000' },
    } as any);
    const res = createMockResponse();
    const next = jest.fn();

    requireApiKeyAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
  });

  it('should update last_used_at on successful authentication', () => {
    const req = createMockRequest({
      headers: { authorization: `Bearer ${rawKey}` },
    } as any);
    const res = createMockResponse();
    const next = jest.fn();

    requireApiKeyAuth(req, res, next);

    expect(next).toHaveBeenCalled();

    const record = testDb
      .prepare('SELECT last_used_at FROM team_api_keys WHERE id = ?')
      .get(keyId) as { last_used_at: string | null };
    expect(record.last_used_at).not.toBeNull();
  });
});
