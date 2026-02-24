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

  it('should have contact column on dependencies table', () => {
    const columns = testDb
      .prepare("PRAGMA table_info('dependencies')")
      .all() as { name: string; type: string; notnull: number }[];

    const contactCol = columns.find(c => c.name === 'contact');
    expect(contactCol).toBeDefined();
    expect(contactCol!.type).toBe('TEXT');
    expect(contactCol!.notnull).toBe(0); // nullable
  });

  it('should allow inserting and retrieving contact on dependencies', () => {
    // Ensure team and service exist
    testDb.prepare(`
      INSERT OR IGNORE INTO teams (id, name) VALUES ('team-contact', 'Contact Test Team')
    `).run();
    testDb.prepare(`
      INSERT OR IGNORE INTO services (id, name, team_id, health_endpoint, poll_interval_ms)
      VALUES ('svc-contact-test', 'Contact Test Service', 'team-contact', 'http://test/health', 30000)
    `).run();

    const contact = JSON.stringify({ team: 'Platform', email: 'platform@co.com' });

    testDb.prepare(`
      INSERT INTO dependencies (id, service_id, name, contact, healthy, health_state)
      VALUES ('dep-contact-1', 'svc-contact-test', 'Test Contact Dep', ?, 1, 0)
    `).run(contact);

    const dep = testDb.prepare('SELECT contact FROM dependencies WHERE id = ?')
      .get('dep-contact-1') as { contact: string | null };

    expect(dep.contact).toBe(contact);
    const parsed = JSON.parse(dep.contact!);
    expect(parsed.team).toBe('Platform');
    expect(parsed.email).toBe('platform@co.com');

    // Cleanup
    testDb.prepare('DELETE FROM dependencies WHERE id = ?').run('dep-contact-1');
    testDb.prepare('DELETE FROM services WHERE id = ?').run('svc-contact-test');
    testDb.prepare('DELETE FROM teams WHERE id = ?').run('team-contact');
  });

  it('should create dependency_canonical_overrides table', () => {
    const tables = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'dependency_canonical_overrides'")
      .all() as { name: string }[];

    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('dependency_canonical_overrides');
  });

  it('should have correct columns on dependency_canonical_overrides', () => {
    const columns = testDb
      .prepare("PRAGMA table_info('dependency_canonical_overrides')")
      .all() as { name: string; type: string; notnull: number; pk: number }[];

    const colMap = Object.fromEntries(columns.map(c => [c.name, c]));

    // id — TEXT PK
    expect(colMap.id).toBeDefined();
    expect(colMap.id.type).toBe('TEXT');
    expect(colMap.id.pk).toBe(1);

    // canonical_name — TEXT NOT NULL
    expect(colMap.canonical_name).toBeDefined();
    expect(colMap.canonical_name.type).toBe('TEXT');
    expect(colMap.canonical_name.notnull).toBe(1);

    // contact_override — TEXT nullable
    expect(colMap.contact_override).toBeDefined();
    expect(colMap.contact_override.type).toBe('TEXT');
    expect(colMap.contact_override.notnull).toBe(0);

    // impact_override — TEXT nullable
    expect(colMap.impact_override).toBeDefined();
    expect(colMap.impact_override.type).toBe('TEXT');
    expect(colMap.impact_override.notnull).toBe(0);

    // created_at — TEXT NOT NULL
    expect(colMap.created_at).toBeDefined();
    expect(colMap.created_at.type).toBe('TEXT');
    expect(colMap.created_at.notnull).toBe(1);

    // updated_at — TEXT NOT NULL
    expect(colMap.updated_at).toBeDefined();
    expect(colMap.updated_at.type).toBe('TEXT');
    expect(colMap.updated_at.notnull).toBe(1);

    // updated_by — TEXT nullable
    expect(colMap.updated_by).toBeDefined();
    expect(colMap.updated_by.type).toBe('TEXT');
    expect(colMap.updated_by.notnull).toBe(0);
  });

  it('should enforce UNIQUE constraint on canonical_name in canonical overrides', () => {
    testDb.prepare(`
      INSERT INTO dependency_canonical_overrides (id, canonical_name, created_at, updated_at)
      VALUES ('co-1', 'shared-db', datetime('now'), datetime('now'))
    `).run();

    expect(() => {
      testDb.prepare(`
        INSERT INTO dependency_canonical_overrides (id, canonical_name, created_at, updated_at)
        VALUES ('co-2', 'shared-db', datetime('now'), datetime('now'))
      `).run();
    }).toThrow(/UNIQUE constraint failed/);

    // Cleanup
    testDb.prepare('DELETE FROM dependency_canonical_overrides WHERE id = ?').run('co-1');
  });

  it('should enforce FK constraint on updated_by referencing users(id)', () => {
    expect(() => {
      testDb.prepare(`
        INSERT INTO dependency_canonical_overrides (id, canonical_name, updated_by, created_at, updated_at)
        VALUES ('co-fk', 'fk-test-dep', 'non-existent-user', datetime('now'), datetime('now'))
      `).run();
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('should allow inserting and retrieving canonical override with all fields', () => {
    // Ensure user exists for updated_by FK
    testDb.prepare(`
      INSERT OR IGNORE INTO users (id, email, name, role)
      VALUES ('user-co', 'co@example.com', 'CO User', 'admin')
    `).run();

    const contactOverride = JSON.stringify({ slack: '#platform-oncall', email: 'oncall@co.com' });

    testDb.prepare(`
      INSERT INTO dependency_canonical_overrides (id, canonical_name, contact_override, impact_override, updated_by, created_at, updated_at)
      VALUES ('co-full', 'redis-cluster', ?, 'Critical - all caching fails', 'user-co', datetime('now'), datetime('now'))
    `).run(contactOverride);

    const row = testDb.prepare('SELECT * FROM dependency_canonical_overrides WHERE id = ?')
      .get('co-full') as Record<string, unknown>;

    expect(row).toBeDefined();
    expect(row.canonical_name).toBe('redis-cluster');
    expect(row.contact_override).toBe(contactOverride);
    expect(row.impact_override).toBe('Critical - all caching fails');
    expect(row.updated_by).toBe('user-co');
    expect(row.created_at).toBeDefined();
    expect(row.updated_at).toBeDefined();

    // Verify JSON round-trip
    const parsed = JSON.parse(row.contact_override as string);
    expect(parsed.slack).toBe('#platform-oncall');
    expect(parsed.email).toBe('oncall@co.com');

    // Cleanup
    testDb.prepare('DELETE FROM dependency_canonical_overrides WHERE id = ?').run('co-full');
    testDb.prepare('DELETE FROM users WHERE id = ?').run('user-co');
  });

  it('should allow null for optional canonical override fields', () => {
    testDb.prepare(`
      INSERT INTO dependency_canonical_overrides (id, canonical_name, created_at, updated_at)
      VALUES ('co-null', 'minimal-dep', datetime('now'), datetime('now'))
    `).run();

    const row = testDb.prepare('SELECT * FROM dependency_canonical_overrides WHERE id = ?')
      .get('co-null') as Record<string, unknown>;

    expect(row.contact_override).toBeNull();
    expect(row.impact_override).toBeNull();
    expect(row.updated_by).toBeNull();

    // Cleanup
    testDb.prepare('DELETE FROM dependency_canonical_overrides WHERE id = ?').run('co-null');
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
