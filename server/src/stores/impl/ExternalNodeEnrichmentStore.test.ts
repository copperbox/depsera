import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrate';
import { ExternalNodeEnrichmentStore } from './ExternalNodeEnrichmentStore';

describe('ExternalNodeEnrichmentStore', () => {
  let db: Database.Database;
  let store: ExternalNodeEnrichmentStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    store = new ExternalNodeEnrichmentStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('upsert', () => {
    it('creates a new record', () => {
      const result = store.upsert({
        canonical_name: 'PostgreSQL',
        display_name: 'PostgreSQL Database',
        description: 'Primary relational database',
        impact: 'Critical',
        service_type: 'database',
      });

      expect(result.canonical_name).toBe('PostgreSQL');
      expect(result.display_name).toBe('PostgreSQL Database');
      expect(result.description).toBe('Primary relational database');
      expect(result.impact).toBe('Critical');
      expect(result.service_type).toBe('database');
      expect(result.id).toBeDefined();
    });

    it('updates existing record by canonical_name', () => {
      store.upsert({ canonical_name: 'Redis', display_name: 'Redis Cache' });
      const updated = store.upsert({ canonical_name: 'Redis', display_name: 'Redis Session Store', impact: 'High' });

      expect(updated.display_name).toBe('Redis Session Store');
      expect(updated.impact).toBe('High');
    });
  });

  describe('findByCanonicalName', () => {
    it('returns matching record', () => {
      store.upsert({ canonical_name: 'Kafka' });
      const result = store.findByCanonicalName('Kafka');
      expect(result).toBeDefined();
      expect(result!.canonical_name).toBe('Kafka');
    });

    it('returns undefined for non-existent name', () => {
      expect(store.findByCanonicalName('nonexistent')).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('returns all records ordered by canonical_name', () => {
      store.upsert({ canonical_name: 'Zebra' });
      store.upsert({ canonical_name: 'Apple' });
      store.upsert({ canonical_name: 'Mango' });

      const all = store.findAll();
      expect(all).toHaveLength(3);
      expect(all[0].canonical_name).toBe('Apple');
      expect(all[1].canonical_name).toBe('Mango');
      expect(all[2].canonical_name).toBe('Zebra');
    });
  });

  describe('delete', () => {
    it('removes the record', () => {
      const record = store.upsert({ canonical_name: 'ToDelete' });
      expect(store.delete(record.id)).toBe(true);
      expect(store.findByCanonicalName('ToDelete')).toBeUndefined();
    });

    it('returns false for non-existent id', () => {
      expect(store.delete('nonexistent')).toBe(false);
    });
  });
});
