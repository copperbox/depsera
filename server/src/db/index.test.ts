import Database from 'better-sqlite3';
import { runMigrations } from './migrate';

describe('Database', () => {
  let testDb: Database.Database;

  beforeAll(() => {
    // Create in-memory database for testing
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    runMigrations(testDb);
  });

  afterAll(() => {
    testDb.close();
  });

  it('should create all required tables', () => {
    const tables = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];

    const tableNames = tables.map(t => t.name).sort();

    expect(tableNames).toContain('users');
    expect(tableNames).toContain('teams');
    expect(tableNames).toContain('team_members');
    expect(tableNames).toContain('services');
    expect(tableNames).toContain('dependencies');
    expect(tableNames).toContain('dependency_associations');
  });

  it('should enforce foreign key constraints', () => {
    // Try to insert a service with non-existent team_id
    expect(() => {
      testDb.prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint)
        VALUES ('test-service', 'Test Service', 'non-existent-team', 'http://localhost/health')
      `).run();
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('should allow inserting valid data', () => {
    // Insert a user
    testDb.prepare(`
      INSERT INTO users (id, email, name, role)
      VALUES ('user-1', 'test@example.com', 'Test User', 'admin')
    `).run();

    // Insert a team
    testDb.prepare(`
      INSERT INTO teams (id, name, description)
      VALUES ('team-1', 'Test Team', 'A test team')
    `).run();

    // Insert a team member
    testDb.prepare(`
      INSERT INTO team_members (team_id, user_id, role)
      VALUES ('team-1', 'user-1', 'lead')
    `).run();

    // Insert a service
    testDb.prepare(`
      INSERT INTO services (id, name, team_id, health_endpoint, poll_interval_ms)
      VALUES ('service-1', 'Test Service', 'team-1', 'http://localhost/health', 30000)
    `).run();

    // Insert a dependency
    testDb.prepare(`
      INSERT INTO dependencies (id, service_id, name, description, healthy, health_state)
      VALUES ('dep-1', 'service-1', 'Test Dependency', 'A test dependency', 1, 0)
    `).run();

    // Verify data
    const user = testDb.prepare('SELECT * FROM users WHERE id = ?').get('user-1');
    expect(user).toBeDefined();

    const service = testDb.prepare('SELECT * FROM services WHERE id = ?').get('service-1');
    expect(service).toBeDefined();

    const dependency = testDb.prepare('SELECT * FROM dependencies WHERE id = ?').get('dep-1');
    expect(dependency).toBeDefined();
  });

  it('should cascade delete dependencies when service is deleted', () => {
    // Delete the service
    testDb.prepare('DELETE FROM services WHERE id = ?').run('service-1');

    // Dependency should also be deleted
    const dependency = testDb.prepare('SELECT * FROM dependencies WHERE id = ?').get('dep-1');
    expect(dependency).toBeUndefined();
  });

  it('should enforce unique constraints', () => {
    // Insert a team
    testDb.prepare(`
      INSERT INTO teams (id, name)
      VALUES ('team-2', 'Unique Team')
    `).run();

    // Try to insert another team with the same name
    expect(() => {
      testDb.prepare(`
        INSERT INTO teams (id, name)
        VALUES ('team-3', 'Unique Team')
      `).run();
    }).toThrow(/UNIQUE constraint failed/);
  });

  it('should enforce check constraints on role fields', () => {
    expect(() => {
      testDb.prepare(`
        INSERT INTO users (id, email, name, role)
        VALUES ('user-invalid', 'invalid@example.com', 'Invalid', 'superadmin')
      `).run();
    }).toThrow(/CHECK constraint failed/);
  });

  it('should have schema_config column on services table', () => {
    const columns = testDb
      .prepare("PRAGMA table_info('services')")
      .all() as { name: string; type: string; notnull: number }[];

    const schemaConfigCol = columns.find(c => c.name === 'schema_config');
    expect(schemaConfigCol).toBeDefined();
    expect(schemaConfigCol!.type).toBe('TEXT');
    expect(schemaConfigCol!.notnull).toBe(0); // nullable
  });

  it('should allow inserting and retrieving schema_config on services', () => {
    // Ensure team exists
    testDb.prepare(`
      INSERT OR IGNORE INTO teams (id, name) VALUES ('team-schema', 'Schema Test Team')
    `).run();

    const schemaConfig = JSON.stringify({
      root: 'data.checks',
      fields: { name: 'checkName', healthy: { field: 'status', equals: 'ok' } },
    });

    testDb.prepare(`
      INSERT INTO services (id, name, team_id, health_endpoint, schema_config, poll_interval_ms)
      VALUES ('svc-schema-test', 'Schema Test Service', 'team-schema', 'http://test/health', ?, 30000)
    `).run(schemaConfig);

    const service = testDb.prepare('SELECT schema_config FROM services WHERE id = ?')
      .get('svc-schema-test') as { schema_config: string | null };

    expect(service.schema_config).toBe(schemaConfig);
    const parsed = JSON.parse(service.schema_config!);
    expect(parsed.root).toBe('data.checks');
    expect(parsed.fields.healthy).toEqual({ field: 'status', equals: 'ok' });

    // Cleanup
    testDb.prepare('DELETE FROM services WHERE id = ?').run('svc-schema-test');
    testDb.prepare('DELETE FROM teams WHERE id = ?').run('team-schema');
  });
});
