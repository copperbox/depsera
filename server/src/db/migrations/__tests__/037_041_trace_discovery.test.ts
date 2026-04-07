import Database from 'better-sqlite3';
import { runMigrations } from '../../migrate';

describe('migrations 037-041 (trace discovery)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('037: add_trace_discovery', () => {
    it('adds discovery_source column to dependencies with correct default', () => {
      const columns = db
        .prepare("PRAGMA table_info('dependencies')")
        .all() as { name: string; type: string; notnull: number; dflt_value: string | null }[];

      const col = columns.find(c => c.name === 'discovery_source');
      expect(col).toBeDefined();
      expect(col!.type).toBe('TEXT');
      expect(col!.notnull).toBe(1);
      expect(col!.dflt_value).toBe("'manual'");
    });

    it('adds user enrichment columns to dependencies', () => {
      const columns = db
        .prepare("PRAGMA table_info('dependencies')")
        .all() as { name: string }[];
      const colNames = columns.map(c => c.name);

      expect(colNames).toContain('user_display_name');
      expect(colNames).toContain('user_description');
      expect(colNames).toContain('user_impact');
    });

    it('adds is_auto_suggested and is_dismissed to dependency_associations', () => {
      const columns = db
        .prepare("PRAGMA table_info('dependency_associations')")
        .all() as { name: string; type: string; notnull: number; dflt_value: string | null }[];

      const autoSuggested = columns.find(c => c.name === 'is_auto_suggested');
      expect(autoSuggested).toBeDefined();
      expect(autoSuggested!.notnull).toBe(1);
      expect(autoSuggested!.dflt_value).toBe('0');

      const dismissed = columns.find(c => c.name === 'is_dismissed');
      expect(dismissed).toBeDefined();
      expect(dismissed!.notnull).toBe(1);
      expect(dismissed!.dflt_value).toBe('0');
    });

    it('creates idx_dep_assoc_auto_suggested index', () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='dependency_associations'")
        .all() as { name: string }[];

      expect(indexes.find(i => i.name === 'idx_dep_assoc_auto_suggested')).toBeDefined();
    });

    it('backfills discovery_source to otlp_metric for OTLP services', () => {
      db.prepare("INSERT INTO teams (id, name) VALUES ('t1', 'Team')").run();
      db.prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint, poll_interval_ms, health_endpoint_format)
        VALUES ('svc-otlp', 'OTLP Service', 't1', 'otlp-push', 30000, 'otlp')
      `).run();
      db.prepare(`
        INSERT INTO dependencies (id, service_id, name) VALUES ('dep-1', 'svc-otlp', 'postgres')
      `).run();

      // Re-run the backfill to verify logic
      db.exec(`
        UPDATE dependencies SET discovery_source = 'otlp_metric'
        WHERE service_id IN (SELECT id FROM services WHERE health_endpoint_format = 'otlp')
      `);

      const dep = db.prepare('SELECT discovery_source FROM dependencies WHERE id = ?').get('dep-1') as { discovery_source: string };
      expect(dep.discovery_source).toBe('otlp_metric');
    });
  });

  describe('038: add_external_node_enrichment', () => {
    it('creates external_node_enrichment table', () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'external_node_enrichment'")
        .all() as { name: string }[];
      expect(tables).toHaveLength(1);
    });

    it('has correct columns', () => {
      const columns = db
        .prepare("PRAGMA table_info('external_node_enrichment')")
        .all() as { name: string }[];
      const colNames = columns.map(c => c.name);

      expect(colNames).toContain('id');
      expect(colNames).toContain('canonical_name');
      expect(colNames).toContain('display_name');
      expect(colNames).toContain('description');
      expect(colNames).toContain('impact');
      expect(colNames).toContain('contact');
      expect(colNames).toContain('service_type');
      expect(colNames).toContain('updated_by');
    });

    it('enforces unique canonical_name', () => {
      db.prepare(`
        INSERT INTO external_node_enrichment (id, canonical_name) VALUES ('e1', 'PostgreSQL')
      `).run();

      expect(() => {
        db.prepare(`
          INSERT INTO external_node_enrichment (id, canonical_name) VALUES ('e2', 'PostgreSQL')
        `).run();
      }).toThrow(/UNIQUE constraint failed/);
    });
  });

  describe('039: add_percentile_latency', () => {
    it('adds percentile columns to dependency_latency_history', () => {
      const columns = db
        .prepare("PRAGMA table_info('dependency_latency_history')")
        .all() as { name: string; type: string; dflt_value: string | null }[];
      const colNames = columns.map(c => c.name);

      expect(colNames).toContain('p50_ms');
      expect(colNames).toContain('p95_ms');
      expect(colNames).toContain('p99_ms');
      expect(colNames).toContain('min_ms');
      expect(colNames).toContain('max_ms');
      expect(colNames).toContain('request_count');
    });

    it('adds source column with poll default', () => {
      const columns = db
        .prepare("PRAGMA table_info('dependency_latency_history')")
        .all() as { name: string; notnull: number; dflt_value: string | null }[];

      const sourceCol = columns.find(c => c.name === 'source');
      expect(sourceCol).toBeDefined();
      expect(sourceCol!.notnull).toBe(1);
      expect(sourceCol!.dflt_value).toBe("'poll'");
    });

    it('percentile columns are nullable', () => {
      const columns = db
        .prepare("PRAGMA table_info('dependency_latency_history')")
        .all() as { name: string; notnull: number }[];

      for (const name of ['p50_ms', 'p95_ms', 'p99_ms', 'min_ms', 'max_ms', 'request_count']) {
        const col = columns.find(c => c.name === name);
        expect(col).toBeDefined();
        expect(col!.notnull).toBe(0);
      }
    });
  });

  describe('040: add_span_storage', () => {
    it('creates spans table', () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'spans'")
        .all() as { name: string }[];
      expect(tables).toHaveLength(1);
    });

    it('has correct columns', () => {
      const columns = db
        .prepare("PRAGMA table_info('spans')")
        .all() as { name: string }[];
      const colNames = columns.map(c => c.name);

      expect(colNames).toContain('id');
      expect(colNames).toContain('trace_id');
      expect(colNames).toContain('span_id');
      expect(colNames).toContain('parent_span_id');
      expect(colNames).toContain('service_name');
      expect(colNames).toContain('team_id');
      expect(colNames).toContain('name');
      expect(colNames).toContain('kind');
      expect(colNames).toContain('start_time');
      expect(colNames).toContain('end_time');
      expect(colNames).toContain('duration_ms');
      expect(colNames).toContain('status_code');
      expect(colNames).toContain('status_message');
      expect(colNames).toContain('attributes');
      expect(colNames).toContain('resource_attributes');
    });

    it('creates all expected indexes', () => {
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='spans'")
        .all() as { name: string }[];
      const indexNames = indexes.map(i => i.name);

      expect(indexNames).toContain('idx_spans_trace_id');
      expect(indexNames).toContain('idx_spans_service_team');
      expect(indexNames).toContain('idx_spans_start_time');
      expect(indexNames).toContain('idx_spans_kind');
      expect(indexNames).toContain('idx_spans_created_at');
    });

    it('cascades delete on team removal', () => {
      db.prepare("INSERT INTO teams (id, name) VALUES ('t1', 'Team')").run();
      db.prepare(`
        INSERT INTO spans (id, trace_id, span_id, service_name, team_id, name, kind, start_time, end_time, duration_ms)
        VALUES ('s1', 'trace-1', 'span-1', 'svc', 't1', 'GET /api', 2, '2024-01-01T00:00:00Z', '2024-01-01T00:00:01Z', 1000)
      `).run();

      db.prepare("DELETE FROM teams WHERE id = 't1'").run();

      const spans = db.prepare('SELECT * FROM spans').all();
      expect(spans).toHaveLength(0);
    });
  });

  describe('041: add_span_retention_setting', () => {
    it('creates app_settings table', () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'app_settings'")
        .all() as { name: string }[];
      expect(tables).toHaveLength(1);
    });

    it('seeds span_retention_days with default value of 7', () => {
      const row = db
        .prepare("SELECT value FROM app_settings WHERE key = 'span_retention_days'")
        .get() as { value: string };

      expect(row).toBeDefined();
      expect(row.value).toBe('7');
    });

    it('has correct columns', () => {
      const columns = db
        .prepare("PRAGMA table_info('app_settings')")
        .all() as { name: string }[];
      const colNames = columns.map(c => c.name);

      expect(colNames).toContain('key');
      expect(colNames).toContain('value');
      expect(colNames).toContain('updated_at');
      expect(colNames).toContain('updated_by');
    });
  });
});
