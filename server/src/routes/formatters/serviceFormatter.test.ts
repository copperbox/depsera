import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

// Create in-memory database for testing
const testDb = new Database(':memory:');

// Mock the db module
jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

import {
  formatTeamFromRow,
  calculateLocalHealth,
  formatServiceListItem,
  formatServiceDetail,
  formatServiceMutation,
  formatNewService,
  formatUpdatedService,
} from './serviceFormatter';
import { Dependency, Service, Team, DependentReport } from '../../db/types';
import { ServiceWithTeam } from '../../stores/types';

describe('serviceFormatter', () => {
  let teamId: string;
  let serviceId: string;

  const createMockServiceWithTeam = (
    overrides: Partial<ServiceWithTeam> = {}
  ): ServiceWithTeam => ({
    id: serviceId,
    name: 'Test Service',
    team_id: teamId,
    health_endpoint: 'https://example.com/health',
    metrics_endpoint: null,
    poll_interval_ms: 30000,
    is_active: 1,
    last_poll_success: 1704067200,
    last_poll_error: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    team_name: 'Test Team',
    team_description: 'A test team',
    team_created_at: '2024-01-01T00:00:00.000Z',
    team_updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  });

  const createMockDependency = (
    overrides: Partial<Dependency> = {}
  ): Dependency => ({
    id: randomUUID(),
    service_id: serviceId,
    name: 'test-dependency',
    canonical_name: null,
    description: null,
    impact: null,
    type: 'rest',
    healthy: 1,
    health_state: 0,
    health_code: 200,
    latency_ms: 100,
    check_details: null,
    error: null,
    error_message: null,
    last_checked: '2024-01-01T00:00:00.000Z',
    last_status_change: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  });

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
        description TEXT,
        impact TEXT,
        type TEXT NOT NULL DEFAULT 'rest',
        healthy INTEGER,
        health_state TEXT,
        health_code INTEGER,
        latency_ms INTEGER,
        check_details TEXT,
        error TEXT,
        error_message TEXT,
        last_checked TEXT,
        last_status_change TEXT,
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
    testDb.exec('DELETE FROM dependency_associations');
    testDb.exec('DELETE FROM dependencies');
    testDb.exec('DELETE FROM services');
    testDb.exec('DELETE FROM teams');

    // Create test data
    teamId = randomUUID();
    serviceId = randomUUID();

    testDb.prepare(`
      INSERT INTO teams (id, name, description)
      VALUES (?, ?, ?)
    `).run(teamId, 'Test Team', 'A test team');

    testDb.prepare(`
      INSERT INTO services (id, name, team_id, health_endpoint)
      VALUES (?, ?, ?, ?)
    `).run(serviceId, 'Test Service', teamId, 'https://example.com/health');
  });

  afterAll(() => {
    testDb.close();
  });

  describe('formatTeamFromRow', () => {
    it('should format team from service row', () => {
      const row = createMockServiceWithTeam();
      const result = formatTeamFromRow(row);

      expect(result.id).toBe(teamId);
      expect(result.name).toBe('Test Team');
      expect(result.description).toBe('A test team');
    });

    it('should handle null description', () => {
      const row = createMockServiceWithTeam({ team_description: null });
      const result = formatTeamFromRow(row);

      expect(result.description).toBeNull();
    });

    it('should use service timestamps when team timestamps missing', () => {
      const row = createMockServiceWithTeam({
        team_created_at: undefined,
        team_updated_at: undefined,
      });
      const result = formatTeamFromRow(row);

      expect(result.created_at).toBe(row.created_at);
      expect(result.updated_at).toBe(row.updated_at);
    });
  });

  describe('calculateLocalHealth', () => {
    it('should return unknown when no dependencies', () => {
      const result = calculateLocalHealth([]);

      expect(result.status).toBe('unknown');
      expect(result.healthy_count).toBe(0);
      expect(result.unhealthy_count).toBe(0);
      expect(result.total_dependencies).toBe(0);
    });

    it('should return healthy when all dependencies healthy', () => {
      const dependencies = [
        createMockDependency({ healthy: 1 }),
        createMockDependency({ healthy: 1 }),
      ];

      const result = calculateLocalHealth(dependencies);

      expect(result.status).toBe('healthy');
      expect(result.healthy_count).toBe(2);
      expect(result.unhealthy_count).toBe(0);
      expect(result.total_dependencies).toBe(2);
    });

    it('should return unhealthy when any dependency unhealthy', () => {
      const dependencies = [
        createMockDependency({ healthy: 1 }),
        createMockDependency({ healthy: 0 }),
      ];

      const result = calculateLocalHealth(dependencies);

      expect(result.status).toBe('unhealthy');
      expect(result.healthy_count).toBe(1);
      expect(result.unhealthy_count).toBe(1);
      expect(result.total_dependencies).toBe(2);
    });

    it('should return degraded when some dependencies have unknown health', () => {
      const dependencies = [
        createMockDependency({ healthy: 1 }),
        createMockDependency({ healthy: null }),
      ];

      const result = calculateLocalHealth(dependencies);

      expect(result.status).toBe('degraded');
      expect(result.healthy_count).toBe(1);
      expect(result.unhealthy_count).toBe(0);
      expect(result.total_dependencies).toBe(2);
    });
  });

  describe('formatServiceListItem', () => {
    it('should format service for list endpoint', () => {
      const row = createMockServiceWithTeam();
      const result = formatServiceListItem(row);

      expect(result.id).toBe(serviceId);
      expect(result.name).toBe('Test Service');
      expect(result.team).toBeDefined();
      expect(result.team.id).toBe(teamId);
      expect(result.health).toBeDefined();
    });
  });

  describe('formatServiceDetail', () => {
    it('should format service for detail endpoint', () => {
      const row = createMockServiceWithTeam();
      const dependencies = [createMockDependency()];
      const dependentReports: DependentReport[] = [];

      const result = formatServiceDetail(row, dependencies, dependentReports);

      expect(result.id).toBe(serviceId);
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependent_reports).toHaveLength(0);
      expect(result.team).toBeDefined();
      expect(result.health).toBeDefined();
    });
  });

  describe('formatServiceMutation', () => {
    it('should format service for mutation response', () => {
      const service: Service = {
        id: serviceId,
        name: 'Test Service',
        team_id: teamId,
        health_endpoint: 'https://example.com/health',
        metrics_endpoint: null,
        poll_interval_ms: 30000,
        is_active: 1,
        last_poll_success: null,
        last_poll_error: null,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const team: Team = {
        id: teamId,
        name: 'Test Team',
        description: 'A test team',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const dependencies = [createMockDependency()];

      const result = formatServiceMutation(service, team, dependencies);

      expect(result.id).toBe(serviceId);
      expect(result.team).toBe(team);
      expect(result.dependencies).toHaveLength(1);
      expect(result.health).toBeDefined();
    });
  });

  describe('formatNewService', () => {
    it('should format new service with empty dependencies', () => {
      const service: Service = {
        id: serviceId,
        name: 'Test Service',
        team_id: teamId,
        health_endpoint: 'https://example.com/health',
        metrics_endpoint: null,
        poll_interval_ms: 30000,
        is_active: 1,
        last_poll_success: null,
        last_poll_error: null,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const team: Team = {
        id: teamId,
        name: 'Test Team',
        description: 'A test team',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const result = formatNewService(service, team);

      expect(result.id).toBe(serviceId);
      expect(result.dependencies).toHaveLength(0);
      expect(result.health.status).toBe('unknown');
    });
  });

  describe('formatUpdatedService', () => {
    it('should return null when service not found', () => {
      const result = formatUpdatedService('non-existent-id');

      expect(result).toBeNull();
    });

    it('should format updated service with dependencies', () => {
      // Add a dependency to the database
      const depId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependencies (id, service_id, name, type, healthy)
        VALUES (?, ?, ?, ?, ?)
      `).run(depId, serviceId, 'db-dependency', 'database', 1);

      const result = formatUpdatedService(serviceId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(serviceId);
      expect(result!.dependencies).toHaveLength(1);
      expect(result!.team).toBeDefined();
      expect(result!.team.name).toBe('Test Team');
    });
  });
});
