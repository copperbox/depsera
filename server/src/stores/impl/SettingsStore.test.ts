import Database from 'better-sqlite3';
import { SettingsStore } from './SettingsStore';

describe('SettingsStore', () => {
  let db: Database.Database;
  let store: SettingsStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by TEXT,
        FOREIGN KEY (updated_by) REFERENCES users(id)
      );

      INSERT INTO users (id, email, name, role)
      VALUES ('user-1', 'admin@test.com', 'Admin User', 'admin');
    `);
    store = new SettingsStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('findAll', () => {
    it('should return empty array when no settings exist', () => {
      const settings = store.findAll();
      expect(settings).toHaveLength(0);
    });

    it('should return all settings ordered by key', () => {
      db.exec(`
        INSERT INTO settings (key, value, updated_by) VALUES
          ('z_setting', 'z_value', 'user-1'),
          ('a_setting', 'a_value', 'user-1')
      `);

      const settings = store.findAll();
      expect(settings).toHaveLength(2);
      expect(settings[0].key).toBe('a_setting');
      expect(settings[1].key).toBe('z_setting');
    });
  });

  describe('findByKey', () => {
    it('should return a setting by key', () => {
      db.exec(`INSERT INTO settings (key, value, updated_by) VALUES ('test_key', 'test_value', 'user-1')`);

      const setting = store.findByKey('test_key');
      expect(setting).toBeDefined();
      expect(setting!.key).toBe('test_key');
      expect(setting!.value).toBe('test_value');
      expect(setting!.updated_by).toBe('user-1');
      expect(setting!.updated_at).toBeDefined();
    });

    it('should return undefined for nonexistent key', () => {
      const setting = store.findByKey('nonexistent');
      expect(setting).toBeUndefined();
    });
  });

  describe('upsert', () => {
    it('should insert a new setting', () => {
      const setting = store.upsert('new_key', 'new_value', 'user-1');

      expect(setting.key).toBe('new_key');
      expect(setting.value).toBe('new_value');
      expect(setting.updated_by).toBe('user-1');
      expect(setting.updated_at).toBeDefined();
    });

    it('should update an existing setting', () => {
      store.upsert('existing_key', 'old_value', 'user-1');
      const updated = store.upsert('existing_key', 'new_value', 'user-1');

      expect(updated.value).toBe('new_value');

      const all = store.findAll();
      expect(all).toHaveLength(1);
    });

    it('should handle null values', () => {
      const setting = store.upsert('nullable_key', null, 'user-1');
      expect(setting.value).toBeNull();
    });
  });

  describe('upsertMany', () => {
    it('should insert multiple settings in a transaction', () => {
      const entries = [
        { key: 'key_1', value: 'value_1' },
        { key: 'key_2', value: 'value_2' },
        { key: 'key_3', value: 'value_3' },
      ];

      const result = store.upsertMany(entries, 'user-1');

      expect(result).toHaveLength(3);
      expect(result[0].key).toBe('key_1');
      expect(result[1].key).toBe('key_2');
      expect(result[2].key).toBe('key_3');
    });

    it('should update existing settings and insert new ones', () => {
      store.upsert('key_1', 'old_value', 'user-1');

      const entries = [
        { key: 'key_1', value: 'updated_value' },
        { key: 'key_2', value: 'new_value' },
      ];

      const result = store.upsertMany(entries, 'user-1');

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe('updated_value');
      expect(result[1].value).toBe('new_value');

      const all = store.findAll();
      expect(all).toHaveLength(2);
    });

    it('should handle empty array', () => {
      const result = store.upsertMany([], 'user-1');
      expect(result).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('should delete an existing setting', () => {
      store.upsert('to_delete', 'value', 'user-1');

      const deleted = store.delete('to_delete');
      expect(deleted).toBe(true);

      const setting = store.findByKey('to_delete');
      expect(setting).toBeUndefined();
    });

    it('should return false for nonexistent key', () => {
      const deleted = store.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });
});
