import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrate';
import { AppSettingsStore } from './AppSettingsStore';

describe('AppSettingsStore', () => {
  let db: Database.Database;
  let store: AppSettingsStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    store = new AppSettingsStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('get', () => {
    it('returns seeded span_retention_days value', () => {
      expect(store.get('span_retention_days')).toBe('7');
    });

    it('returns undefined for missing key', () => {
      expect(store.get('nonexistent_key')).toBeUndefined();
    });
  });

  describe('set', () => {
    it('creates a new entry', () => {
      store.set('custom_key', 'custom_value');
      expect(store.get('custom_key')).toBe('custom_value');
    });

    it('updates an existing entry', () => {
      store.set('span_retention_days', '14');
      expect(store.get('span_retention_days')).toBe('14');
    });

    it('stores updatedBy when provided', () => {
      db.prepare("INSERT INTO users (id, email, name, role) VALUES ('u1', 'a@b.com', 'Admin', 'admin')").run();
      store.set('span_retention_days', '30', 'u1');

      const row = db.prepare("SELECT updated_by FROM app_settings WHERE key = 'span_retention_days'").get() as { updated_by: string };
      expect(row.updated_by).toBe('u1');
    });
  });
});
