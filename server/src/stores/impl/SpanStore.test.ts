import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrate';
import { SpanStore } from './SpanStore';
import { CreateSpanInput } from '../../db/types';

describe('SpanStore', () => {
  let db: Database.Database;
  let store: SpanStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    db.prepare("INSERT INTO teams (id, name) VALUES ('team-1', 'Test Team')").run();
    store = new SpanStore(db);
  });

  afterEach(() => {
    db.close();
  });

  const makeSpan = (overrides: Partial<CreateSpanInput> = {}): CreateSpanInput => ({
    trace_id: 'trace-1',
    span_id: 'span-1',
    service_name: 'my-service',
    team_id: 'team-1',
    name: 'GET /api/users',
    kind: 3, // CLIENT
    start_time: '2024-01-01T00:00:00Z',
    end_time: '2024-01-01T00:00:00.100Z',
    duration_ms: 100,
    ...overrides,
  });

  describe('bulkInsert', () => {
    it('returns 0 for empty array', () => {
      expect(store.bulkInsert([])).toBe(0);
    });

    it('inserts multiple spans', () => {
      const spans = [
        makeSpan({ span_id: 'span-1' }),
        makeSpan({ span_id: 'span-2', name: 'POST /api/orders' }),
        makeSpan({ span_id: 'span-3', name: 'GET /api/items', kind: 2 }),
      ];

      const count = store.bulkInsert(spans);
      expect(count).toBe(3);

      const all = db.prepare('SELECT * FROM spans').all();
      expect(all).toHaveLength(3);
    });

    it('generates unique IDs for each span', () => {
      store.bulkInsert([makeSpan({ span_id: 'a' }), makeSpan({ span_id: 'b' })]);

      const rows = db.prepare('SELECT id FROM spans').all() as { id: string }[];
      expect(rows[0].id).not.toBe(rows[1].id);
    });

    it('stores attributes as provided', () => {
      const attrs = JSON.stringify({ 'http.method': 'GET' });
      store.bulkInsert([makeSpan({ attributes: attrs })]);

      const row = db.prepare('SELECT attributes FROM spans').get() as { attributes: string };
      expect(row.attributes).toBe(attrs);
    });
  });

  describe('findByTraceId', () => {
    it('returns spans for a given trace ordered by start_time', () => {
      store.bulkInsert([
        makeSpan({ span_id: 'late', start_time: '2024-01-01T00:00:02Z' }),
        makeSpan({ span_id: 'early', start_time: '2024-01-01T00:00:00Z' }),
        makeSpan({ span_id: 'mid', start_time: '2024-01-01T00:00:01Z' }),
      ]);

      const spans = store.findByTraceId('trace-1');
      expect(spans).toHaveLength(3);
      expect(spans[0].span_id).toBe('early');
      expect(spans[1].span_id).toBe('mid');
      expect(spans[2].span_id).toBe('late');
    });

    it('returns empty for non-existent trace', () => {
      expect(store.findByTraceId('no-such-trace')).toHaveLength(0);
    });

    it('does not return spans from other traces', () => {
      store.bulkInsert([
        makeSpan({ trace_id: 'trace-1', span_id: 's1' }),
        makeSpan({ trace_id: 'trace-2', span_id: 's2' }),
      ]);

      const spans = store.findByTraceId('trace-1');
      expect(spans).toHaveLength(1);
      expect(spans[0].span_id).toBe('s1');
    });
  });

  describe('findByServiceName', () => {
    it('filters by service name', () => {
      store.bulkInsert([
        makeSpan({ service_name: 'svc-a', span_id: 's1' }),
        makeSpan({ service_name: 'svc-b', span_id: 's2' }),
      ]);

      const spans = store.findByServiceName('svc-a');
      expect(spans).toHaveLength(1);
      expect(spans[0].span_id).toBe('s1');
    });

    it('filters by since timestamp', () => {
      store.bulkInsert([
        makeSpan({ span_id: 'old', start_time: '2024-01-01T00:00:00Z' }),
        makeSpan({ span_id: 'new', start_time: '2024-06-01T00:00:00Z' }),
      ]);

      const spans = store.findByServiceName('my-service', { since: '2024-03-01T00:00:00Z' });
      expect(spans).toHaveLength(1);
      expect(spans[0].span_id).toBe('new');
    });

    it('respects limit', () => {
      store.bulkInsert([
        makeSpan({ span_id: 's1' }),
        makeSpan({ span_id: 's2' }),
        makeSpan({ span_id: 's3' }),
      ]);

      const spans = store.findByServiceName('my-service', { limit: 2 });
      expect(spans).toHaveLength(2);
    });
  });

  describe('deleteOlderThan', () => {
    it('removes old spans and keeps recent ones', () => {
      store.bulkInsert([
        makeSpan({ span_id: 'old' }),
        makeSpan({ span_id: 'new' }),
      ]);

      // Update created_at to simulate old vs new
      db.prepare("UPDATE spans SET created_at = '2024-01-01T00:00:00Z' WHERE span_id = 'old'").run();
      db.prepare("UPDATE spans SET created_at = '2024-12-01T00:00:00Z' WHERE span_id = 'new'").run();

      const deleted = store.deleteOlderThan('2024-06-01T00:00:00Z');
      expect(deleted).toBe(1);

      const remaining = db.prepare('SELECT span_id FROM spans').all() as { span_id: string }[];
      expect(remaining).toHaveLength(1);
      expect(remaining[0].span_id).toBe('new');
    });
  });
});
