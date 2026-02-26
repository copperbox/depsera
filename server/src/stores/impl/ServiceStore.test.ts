import Database from 'better-sqlite3';
import { ServiceStore } from './ServiceStore';
import { InvalidOrderByError } from '../orderByValidator';

describe('ServiceStore', () => {
  let db: Database.Database;
  let store: ServiceStore;

  beforeAll(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        health_endpoint TEXT NOT NULL,
        metrics_endpoint TEXT,
        schema_config TEXT,
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_external INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        last_poll_success INTEGER,
        last_poll_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO teams (id, name) VALUES
        ('team-1', 'Team One'),
        ('team-2', 'Team Two');
    `);

    store = new ServiceStore(db);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    db.exec('DELETE FROM services');
  });

  describe('create and findById', () => {
    it('should create service with default poll_interval_ms', () => {
      const service = store.create({
        name: 'Test Service',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      expect(service.name).toBe('Test Service');
      expect(service.poll_interval_ms).toBe(30000);
      expect(service.is_active).toBe(1);
    });

    it('should create service with custom poll_interval_ms', () => {
      const service = store.create({
        name: 'Test Service',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
        poll_interval_ms: 60000,
      });

      expect(service.poll_interval_ms).toBe(60000);
    });

    it('should create service with metrics_endpoint', () => {
      const service = store.create({
        name: 'Test Service',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
        metrics_endpoint: 'http://test/metrics',
      });

      expect(service.metrics_endpoint).toBe('http://test/metrics');
    });

    it('should create service with schema_config', () => {
      const schemaConfig = JSON.stringify({
        root: 'data.checks',
        fields: { name: 'checkName', healthy: { field: 'status', equals: 'ok' } },
      });
      const service = store.create({
        name: 'Schema Service',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
        schema_config: schemaConfig,
      });

      expect(service.schema_config).toBe(schemaConfig);
    });

    it('should create service with null schema_config by default', () => {
      const service = store.create({
        name: 'No Schema Service',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      expect(service.schema_config).toBeNull();
    });

    it('should find service by id', () => {
      const created = store.create({
        name: 'Find Me',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      const found = store.findById(created.id);
      expect(found?.name).toBe('Find Me');
    });

    it('should return undefined for non-existent id', () => {
      const found = store.findById('non-existent');
      expect(found).toBeUndefined();
    });
  });

  describe('findByIdWithTeam', () => {
    it('should return service with team info', () => {
      const service = store.create({
        name: 'Test Service',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      const result = store.findByIdWithTeam(service.id);
      expect(result?.name).toBe('Test Service');
      expect(result?.team_name).toBe('Team One');
    });

    it('should return undefined for non-existent id', () => {
      const result = store.findByIdWithTeam('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('findByIdsWithTeam', () => {
    it('should return empty array for empty ids', () => {
      const result = store.findByIdsWithTeam([]);
      expect(result).toEqual([]);
    });

    it('should return services with team info for given ids', () => {
      const s1 = store.create({ name: 'Service A', team_id: 'team-1', health_endpoint: 'http://a/health' });
      const s2 = store.create({ name: 'Service B', team_id: 'team-2', health_endpoint: 'http://b/health' });
      store.create({ name: 'Service C', team_id: 'team-1', health_endpoint: 'http://c/health' });

      const result = store.findByIdsWithTeam([s1.id, s2.id]);
      expect(result).toHaveLength(2);

      const names = result.map(s => s.name).sort();
      expect(names).toEqual(['Service A', 'Service B']);

      const serviceA = result.find(s => s.id === s1.id)!;
      expect(serviceA.team_name).toBe('Team One');

      const serviceB = result.find(s => s.id === s2.id)!;
      expect(serviceB.team_name).toBe('Team Two');
    });

    it('should skip non-existent ids', () => {
      const s1 = store.create({ name: 'Exists', team_id: 'team-1', health_endpoint: 'http://a/health' });

      const result = store.findByIdsWithTeam([s1.id, 'non-existent']);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Exists');
    });

    it('should return single service for single id', () => {
      const s1 = store.create({ name: 'Only One', team_id: 'team-1', health_endpoint: 'http://a/health' });

      const result = store.findByIdsWithTeam([s1.id]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Only One');
      expect(result[0].team_name).toBe('Team One');
    });
  });

  describe('findAll and findAllWithTeam', () => {
    beforeEach(() => {
      store.create({ name: 'Service A', team_id: 'team-1', health_endpoint: 'http://a/health' });
      store.create({ name: 'Service B', team_id: 'team-1', health_endpoint: 'http://b/health' });
      store.create({ name: 'Service C', team_id: 'team-2', health_endpoint: 'http://c/health' });
    });

    it('should return all services', () => {
      const services = store.findAll();
      expect(services).toHaveLength(3);
    });

    it('should filter by teamId', () => {
      const services = store.findAll({ teamId: 'team-1' });
      expect(services).toHaveLength(2);
    });

    it('should filter by teamIds array', () => {
      const services = store.findAll({ teamIds: ['team-1', 'team-2'] });
      expect(services).toHaveLength(3);
    });

    it('should filter by single teamIds entry', () => {
      const services = store.findAll({ teamIds: ['team-2'] });
      expect(services).toHaveLength(1);
      expect(services[0].name).toBe('Service C');
    });

    it('should return empty for empty teamIds array', () => {
      const services = store.findAll({ teamIds: [] });
      // Empty teamIds should not add a filter, returning all
      expect(services).toHaveLength(3);
    });

    it('should prefer teamId over teamIds when both are provided', () => {
      const services = store.findAll({ teamId: 'team-1', teamIds: ['team-2'] });
      expect(services).toHaveLength(2); // teamId takes precedence
    });

    it('should filter by teamIds in findAllWithTeam', () => {
      const services = store.findAllWithTeam({ teamIds: ['team-2'] });
      expect(services).toHaveLength(1);
      expect(services[0].team_name).toBe('Team Two');
    });

    it('should filter by isActive', () => {
      // Deactivate one service
      const all = store.findAll();
      store.update(all[0].id, { is_active: false });

      const active = store.findAll({ isActive: true });
      expect(active).toHaveLength(2);

      const inactive = store.findAll({ isActive: false });
      expect(inactive).toHaveLength(1);
    });

    it('should support pagination with limit', () => {
      const services = store.findAll({ limit: 2 });
      expect(services).toHaveLength(2);
    });

    it('should support pagination with limit and offset', () => {
      const services = store.findAll({ limit: 2, offset: 1 });
      expect(services).toHaveLength(2);
    });

    it('should support orderBy and orderDirection', () => {
      const servicesAsc = store.findAll({ orderBy: 'name', orderDirection: 'ASC' });
      expect(servicesAsc[0].name).toBe('Service A');

      const servicesDesc = store.findAll({ orderBy: 'name', orderDirection: 'DESC' });
      expect(servicesDesc[0].name).toBe('Service C');
    });

    it('should accept other valid orderBy columns', () => {
      const services = store.findAll({ orderBy: 'created_at', orderDirection: 'DESC' });
      expect(services).toHaveLength(3);
    });

    it('should throw InvalidOrderByError for non-whitelisted column in findAll', () => {
      expect(() => store.findAll({ orderBy: 'invalid_column' }))
        .toThrow(InvalidOrderByError);
    });

    it('should throw InvalidOrderByError for SQL injection via orderBy in findAll', () => {
      expect(() => store.findAll({ orderBy: 'name; DROP TABLE services; --' }))
        .toThrow(InvalidOrderByError);
    });

    it('should throw InvalidOrderByError for invalid orderDirection in findAll', () => {
      expect(() => store.findAll({ orderBy: 'name', orderDirection: 'INVALID' as 'ASC' }))
        .toThrow(InvalidOrderByError);
    });

    it('should throw InvalidOrderByError for non-whitelisted column in findAllWithTeam', () => {
      expect(() => store.findAllWithTeam({ orderBy: 'invalid_column' }))
        .toThrow(InvalidOrderByError);
    });

    it('should accept aliased column in findAllWithTeam', () => {
      const services = store.findAllWithTeam({ orderBy: 's.created_at', orderDirection: 'DESC' });
      expect(services).toHaveLength(3);
    });

    it('should return services with team info', () => {
      const services = store.findAllWithTeam();
      expect(services).toHaveLength(3);
      expect(services[0].team_name).toBeDefined();
    });

    it('should support pagination in findAllWithTeam', () => {
      const services = store.findAllWithTeam({ limit: 2, offset: 1 });
      expect(services).toHaveLength(2);
    });
  });

  describe('findActive and findActiveWithTeam', () => {
    beforeEach(() => {
      store.create({ name: 'Active', team_id: 'team-1', health_endpoint: 'http://a/health' });
      store.create({ name: 'Inactive', team_id: 'team-1', health_endpoint: 'http://b/health' });
      store.update(store.findAll()[1].id, { is_active: false });
    });

    it('should return only active services', () => {
      const active = store.findActive();
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe('Active');
    });

    it('should return active services with team', () => {
      const active = store.findActiveWithTeam();
      expect(active).toHaveLength(1);
      expect(active[0].team_name).toBe('Team One');
    });
  });

  describe('isExternal filtering', () => {
    beforeEach(() => {
      store.create({ name: 'Tracked', team_id: 'team-1', health_endpoint: 'http://a/health' });
      store.create({ name: 'External', team_id: 'team-1', health_endpoint: '', is_external: true });
    });

    it('should filter by isExternal: true', () => {
      const externals = store.findAll({ isExternal: true });
      expect(externals).toHaveLength(1);
      expect(externals[0].name).toBe('External');
      expect(externals[0].is_external).toBe(1);
    });

    it('should filter by isExternal: false', () => {
      const tracked = store.findAll({ isExternal: false });
      expect(tracked).toHaveLength(1);
      expect(tracked[0].name).toBe('Tracked');
      expect(tracked[0].is_external).toBe(0);
    });

    it('should return all when isExternal is not specified', () => {
      const all = store.findAll();
      expect(all).toHaveLength(2);
    });

    it('should exclude external services from findActive', () => {
      const active = store.findActive();
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe('Tracked');
    });

    it('should exclude external services from findActiveWithTeam', () => {
      const active = store.findActiveWithTeam();
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe('Tracked');
      expect(active[0].team_name).toBe('Team One');
    });

    it('should filter by isExternal in findAllWithTeam', () => {
      const externals = store.findAllWithTeam({ isExternal: true });
      expect(externals).toHaveLength(1);
      expect(externals[0].name).toBe('External');
      expect(externals[0].team_name).toBe('Team One');
    });

    it('should filter by isExternal in count', () => {
      expect(store.count({ isExternal: true })).toBe(1);
      expect(store.count({ isExternal: false })).toBe(1);
    });
  });

  describe('create external service', () => {
    it('should create service with is_external flag', () => {
      const service = store.create({
        name: 'External DB',
        team_id: 'team-1',
        health_endpoint: '',
        is_external: true,
      });

      expect(service.is_external).toBe(1);
      expect(service.health_endpoint).toBe('');
    });

    it('should create service with description', () => {
      const service = store.create({
        name: 'External API',
        team_id: 'team-1',
        health_endpoint: '',
        is_external: true,
        description: 'Third-party payment gateway',
      });

      expect(service.description).toBe('Third-party payment gateway');
    });

    it('should default description to null', () => {
      const service = store.create({
        name: 'No Desc',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      expect(service.description).toBeNull();
    });

    it('should default is_external to 0', () => {
      const service = store.create({
        name: 'Tracked',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      expect(service.is_external).toBe(0);
    });
  });

  describe('update description', () => {
    it('should update description', () => {
      const service = store.create({
        name: 'Test',
        team_id: 'team-1',
        health_endpoint: '',
        is_external: true,
      });

      const updated = store.update(service.id, { description: 'New desc' });
      expect(updated?.description).toBe('New desc');
    });

    it('should clear description with null', () => {
      const service = store.create({
        name: 'Test',
        team_id: 'team-1',
        health_endpoint: '',
        is_external: true,
        description: 'Has desc',
      });

      const updated = store.update(service.id, { description: null });
      expect(updated?.description).toBeNull();
    });
  });

  describe('findByTeamId', () => {
    beforeEach(() => {
      store.create({ name: 'Team1 Service', team_id: 'team-1', health_endpoint: 'http://a/health' });
      store.create({ name: 'Team2 Service', team_id: 'team-2', health_endpoint: 'http://b/health' });
    });

    it('should return services for specific team', () => {
      const services = store.findByTeamId('team-1');
      expect(services).toHaveLength(1);
      expect(services[0].name).toBe('Team1 Service');
    });
  });

  describe('update', () => {
    it('should update name', () => {
      const service = store.create({
        name: 'Original',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      const updated = store.update(service.id, { name: 'Updated' });
      expect(updated?.name).toBe('Updated');
    });

    it('should update team_id', () => {
      const service = store.create({
        name: 'Test',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      const updated = store.update(service.id, { team_id: 'team-2' });
      expect(updated?.team_id).toBe('team-2');
    });

    it('should update health_endpoint', () => {
      const service = store.create({
        name: 'Test',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      const updated = store.update(service.id, { health_endpoint: 'http://new/health' });
      expect(updated?.health_endpoint).toBe('http://new/health');
    });

    it('should update metrics_endpoint', () => {
      const service = store.create({
        name: 'Test',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      const updated = store.update(service.id, { metrics_endpoint: 'http://metrics' });
      expect(updated?.metrics_endpoint).toBe('http://metrics');
    });

    it('should update schema_config', () => {
      const service = store.create({
        name: 'Test',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      const schemaConfig = JSON.stringify({ root: 'checks', fields: { name: 'n', healthy: 'h' } });
      const updated = store.update(service.id, { schema_config: schemaConfig });
      expect(updated?.schema_config).toBe(schemaConfig);
    });

    it('should clear schema_config when set to null', () => {
      const schemaConfig = JSON.stringify({ root: 'checks', fields: { name: 'n', healthy: 'h' } });
      const service = store.create({
        name: 'Test',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
        schema_config: schemaConfig,
      });

      const updated = store.update(service.id, { schema_config: null });
      expect(updated?.schema_config).toBeNull();
    });

    it('should update poll_interval_ms', () => {
      const service = store.create({
        name: 'Test',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      const updated = store.update(service.id, { poll_interval_ms: 60000 });
      expect(updated?.poll_interval_ms).toBe(60000);
    });

    it('should update is_active', () => {
      const service = store.create({
        name: 'Test',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      const updated = store.update(service.id, { is_active: false });
      expect(updated?.is_active).toBe(0);
    });

    it('should return existing if no updates provided', () => {
      const service = store.create({
        name: 'Test',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      const result = store.update(service.id, {});
      expect(result?.name).toBe('Test');
    });

    it('should return undefined for non-existent id', () => {
      const result = store.update('non-existent', { name: 'New Name' });
      expect(result).toBeUndefined();
    });
  });

  describe('updatePollResult', () => {
    it('should update poll success', () => {
      const service = store.create({
        name: 'Test',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      store.updatePollResult(service.id, true);

      const updated = store.findById(service.id);
      expect(updated?.last_poll_success).toBe(1);
      expect(updated?.last_poll_error).toBeNull();
    });

    it('should update poll failure with error', () => {
      const service = store.create({
        name: 'Test',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      store.updatePollResult(service.id, false, 'Connection timeout');

      const updated = store.findById(service.id);
      expect(updated?.last_poll_success).toBe(0);
      expect(updated?.last_poll_error).toBe('Connection timeout');
    });
  });

  describe('delete', () => {
    it('should delete service and return true', () => {
      const service = store.create({
        name: 'To Delete',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      const result = store.delete(service.id);
      expect(result).toBe(true);
      expect(store.findById(service.id)).toBeUndefined();
    });

    it('should return false for non-existent id', () => {
      const result = store.delete('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true for existing service', () => {
      const service = store.create({
        name: 'Test',
        team_id: 'team-1',
        health_endpoint: 'http://test/health',
      });

      expect(store.exists(service.id)).toBe(true);
    });

    it('should return false for non-existent service', () => {
      expect(store.exists('non-existent')).toBe(false);
    });
  });

  describe('count', () => {
    beforeEach(() => {
      store.create({ name: 'Svc1', team_id: 'team-1', health_endpoint: 'http://a/health' });
      store.create({ name: 'Svc2', team_id: 'team-1', health_endpoint: 'http://b/health' });
      store.create({ name: 'Svc3', team_id: 'team-2', health_endpoint: 'http://c/health' });
    });

    it('should count all services', () => {
      expect(store.count()).toBe(3);
    });

    it('should count services by team', () => {
      expect(store.count({ teamId: 'team-1' })).toBe(2);
      expect(store.count({ teamId: 'team-2' })).toBe(1);
    });

    it('should count active services', () => {
      const all = store.findAll();
      store.update(all[0].id, { is_active: false });

      expect(store.count({ isActive: true })).toBe(2);
      expect(store.count({ isActive: false })).toBe(1);
    });
  });
});
