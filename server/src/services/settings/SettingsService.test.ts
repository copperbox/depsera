import Database from 'better-sqlite3';
import { SettingsStore } from '../../stores/impl/SettingsStore';
import { SettingsService, isValidSettingsKey, validateSettingValue, getSettingsKeys } from './SettingsService';

describe('SettingsService', () => {
  let db: Database.Database;
  let store: SettingsStore;
  let service: SettingsService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT,
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
    SettingsService.resetInstance();
    service = new SettingsService(store);
  });

  afterEach(() => {
    db.close();
    SettingsService.resetInstance();
  });

  describe('loadFromDatabase', () => {
    it('should load settings from database into cache', () => {
      store.upsert('data_retention_days', '180', 'user-1');
      store.upsert('global_rate_limit', '200', 'user-1');

      service.loadFromDatabase();

      expect(service.get('data_retention_days')).toBe(180);
      expect(service.get('global_rate_limit')).toBe(200);
    });

    it('should clear previous cache before loading', () => {
      store.upsert('data_retention_days', '180', 'user-1');
      service.loadFromDatabase();
      expect(service.get('data_retention_days')).toBe(180);

      // Delete from DB and reload
      store.delete('data_retention_days');
      service.loadFromDatabase();

      // Should fall back to default (365)
      expect(service.get('data_retention_days')).toBe(365);
    });
  });

  describe('get', () => {
    it('should return default values when no DB overrides exist', () => {
      service.loadFromDatabase();

      expect(service.get('data_retention_days')).toBe(365);
      expect(service.get('retention_cleanup_time')).toBe('02:00');
      expect(service.get('default_poll_interval_ms')).toBe(30000);
      expect(service.get('global_rate_limit')).toBe(3000);
      expect(service.get('global_rate_limit_window_minutes')).toBe(1);
      expect(service.get('auth_rate_limit')).toBe(20);
      expect(service.get('auth_rate_limit_window_minutes')).toBe(1);
      expect(service.get('alert_cooldown_minutes')).toBe(5);
      expect(service.get('alert_rate_limit_per_hour')).toBe(30);
    });

    it('should return DB value when set, overriding default', () => {
      store.upsert('data_retention_days', '90', 'user-1');
      service.loadFromDatabase();

      expect(service.get('data_retention_days')).toBe(90);
    });

    it('should parse numeric values correctly', () => {
      store.upsert('global_rate_limit', '500', 'user-1');
      service.loadFromDatabase();

      expect(service.get('global_rate_limit')).toBe(500);
    });

    it('should return string values for string settings', () => {
      store.upsert('retention_cleanup_time', '03:30', 'user-1');
      service.loadFromDatabase();

      expect(service.get('retention_cleanup_time')).toBe('03:30');
    });
  });

  describe('getAll', () => {
    it('should return all settings with source info', () => {
      store.upsert('data_retention_days', '180', 'user-1');
      service.loadFromDatabase();

      const all = service.getAll();

      expect(all.data_retention_days).toEqual({ value: 180, source: 'database' });
      expect(all.global_rate_limit).toEqual({ value: 3000, source: 'default' });
    });

    it('should include all known keys', () => {
      service.loadFromDatabase();
      const all = service.getAll();
      const keys = Object.keys(all);

      expect(keys).toContain('data_retention_days');
      expect(keys).toContain('retention_cleanup_time');
      expect(keys).toContain('default_poll_interval_ms');
      expect(keys).toContain('ssrf_allowlist');
      expect(keys).toContain('global_rate_limit');
      expect(keys).toContain('global_rate_limit_window_minutes');
      expect(keys).toContain('auth_rate_limit');
      expect(keys).toContain('auth_rate_limit_window_minutes');
      expect(keys).toContain('alert_cooldown_minutes');
      expect(keys).toContain('alert_rate_limit_per_hour');
    });
  });

  describe('update', () => {
    beforeEach(() => {
      service.loadFromDatabase();
    });

    it('should update a single setting', () => {
      const result = service.update({ data_retention_days: 90 }, 'user-1');

      expect(result).toHaveLength(1);
      expect(service.get('data_retention_days')).toBe(90);
    });

    it('should update multiple settings', () => {
      const result = service.update({
        data_retention_days: 180,
        global_rate_limit: 200,
      }, 'user-1');

      expect(result).toHaveLength(2);
      expect(service.get('data_retention_days')).toBe(180);
      expect(service.get('global_rate_limit')).toBe(200);
    });

    it('should persist updates to database', () => {
      service.update({ data_retention_days: 90 }, 'user-1');

      const dbValue = store.findByKey('data_retention_days');
      expect(dbValue).toBeDefined();
      expect(dbValue!.value).toBe('90');
    });

    it('should update cache immediately', () => {
      service.update({ data_retention_days: 42 }, 'user-1');

      // Should reflect immediately without reloading
      expect(service.get('data_retention_days')).toBe(42);
    });

    it('should skip unknown keys', () => {
      const result = service.update({ unknown_key: 'value' } as never, 'user-1');
      expect(result).toHaveLength(0);
    });

    it('should throw ValidationError for invalid values', () => {
      expect(() => {
        service.update({ data_retention_days: 0 }, 'user-1');
      }).toThrow('data_retention_days must be between 1 and 3650');
    });

    it('should throw ValidationError for invalid retention_cleanup_time', () => {
      expect(() => {
        service.update({ retention_cleanup_time: 'invalid' }, 'user-1');
      }).toThrow('retention_cleanup_time must be in HH:MM format');
    });

    it('should throw ValidationError for out-of-range poll interval', () => {
      expect(() => {
        service.update({ default_poll_interval_ms: 1000 }, 'user-1');
      }).toThrow('default_poll_interval_ms must be between 5000 and 3600000');
    });
  });

  describe('singleton', () => {
    it('should return same instance from getInstance', () => {
      SettingsService.resetInstance();
      const instance1 = SettingsService.getInstance(store);
      const instance2 = SettingsService.getInstance(store);

      expect(instance1).toBe(instance2);
    });

    it('should reset instance', () => {
      const instance1 = SettingsService.getInstance(store);
      SettingsService.resetInstance();
      const instance2 = SettingsService.getInstance(store);

      expect(instance1).not.toBe(instance2);
    });
  });
});

describe('isValidSettingsKey', () => {
  it('should return true for valid keys', () => {
    expect(isValidSettingsKey('data_retention_days')).toBe(true);
    expect(isValidSettingsKey('global_rate_limit')).toBe(true);
    expect(isValidSettingsKey('alert_cooldown_minutes')).toBe(true);
  });

  it('should return false for invalid keys', () => {
    expect(isValidSettingsKey('unknown_key')).toBe(false);
    expect(isValidSettingsKey('')).toBe(false);
    expect(isValidSettingsKey('DATA_RETENTION_DAYS')).toBe(false);
  });
});

describe('getSettingsKeys', () => {
  it('should return all known keys', () => {
    const keys = getSettingsKeys();
    expect(keys).toHaveLength(10);
    expect(keys).toContain('data_retention_days');
    expect(keys).toContain('alert_rate_limit_per_hour');
  });

  it('should return a copy, not the original array', () => {
    const keys1 = getSettingsKeys();
    const keys2 = getSettingsKeys();
    expect(keys1).not.toBe(keys2);
    expect(keys1).toEqual(keys2);
  });
});

describe('validateSettingValue', () => {
  it('should accept valid data_retention_days', () => {
    expect(validateSettingValue('data_retention_days', '1')).toBeNull();
    expect(validateSettingValue('data_retention_days', '365')).toBeNull();
    expect(validateSettingValue('data_retention_days', '3650')).toBeNull();
  });

  it('should reject invalid data_retention_days', () => {
    expect(validateSettingValue('data_retention_days', '0')).toBeTruthy();
    expect(validateSettingValue('data_retention_days', '3651')).toBeTruthy();
    expect(validateSettingValue('data_retention_days', 'abc')).toBeTruthy();
  });

  it('should accept valid retention_cleanup_time', () => {
    expect(validateSettingValue('retention_cleanup_time', '00:00')).toBeNull();
    expect(validateSettingValue('retention_cleanup_time', '02:00')).toBeNull();
    expect(validateSettingValue('retention_cleanup_time', '23:59')).toBeNull();
  });

  it('should reject invalid retention_cleanup_time', () => {
    expect(validateSettingValue('retention_cleanup_time', '2:00')).toBeTruthy();
    expect(validateSettingValue('retention_cleanup_time', '25:00')).toBeTruthy();
    expect(validateSettingValue('retention_cleanup_time', 'midnight')).toBeTruthy();
  });

  it('should accept valid default_poll_interval_ms', () => {
    expect(validateSettingValue('default_poll_interval_ms', '5000')).toBeNull();
    expect(validateSettingValue('default_poll_interval_ms', '30000')).toBeNull();
    expect(validateSettingValue('default_poll_interval_ms', '3600000')).toBeNull();
  });

  it('should reject invalid default_poll_interval_ms', () => {
    expect(validateSettingValue('default_poll_interval_ms', '4999')).toBeTruthy();
    expect(validateSettingValue('default_poll_interval_ms', '3600001')).toBeTruthy();
  });

  it('should accept any ssrf_allowlist value', () => {
    expect(validateSettingValue('ssrf_allowlist', '')).toBeNull();
    expect(validateSettingValue('ssrf_allowlist', 'localhost,*.internal')).toBeNull();
  });

  it('should accept valid rate limit values', () => {
    expect(validateSettingValue('global_rate_limit', '1')).toBeNull();
    expect(validateSettingValue('global_rate_limit', '10000')).toBeNull();
    expect(validateSettingValue('auth_rate_limit', '1')).toBeNull();
    expect(validateSettingValue('auth_rate_limit', '1000')).toBeNull();
  });

  it('should reject invalid rate limit values', () => {
    expect(validateSettingValue('global_rate_limit', '0')).toBeTruthy();
    expect(validateSettingValue('global_rate_limit', '10001')).toBeTruthy();
    expect(validateSettingValue('auth_rate_limit', '0')).toBeTruthy();
  });

  it('should accept valid alert settings', () => {
    expect(validateSettingValue('alert_cooldown_minutes', '0')).toBeNull();
    expect(validateSettingValue('alert_cooldown_minutes', '1440')).toBeNull();
    expect(validateSettingValue('alert_rate_limit_per_hour', '1')).toBeNull();
    expect(validateSettingValue('alert_rate_limit_per_hour', '1000')).toBeNull();
  });

  it('should reject invalid alert settings', () => {
    expect(validateSettingValue('alert_cooldown_minutes', '-1')).toBeTruthy();
    expect(validateSettingValue('alert_cooldown_minutes', '1441')).toBeTruthy();
    expect(validateSettingValue('alert_rate_limit_per_hour', '0')).toBeTruthy();
    expect(validateSettingValue('alert_rate_limit_per_hour', '1001')).toBeTruthy();
  });

  it('should accept valid window minutes', () => {
    expect(validateSettingValue('global_rate_limit_window_minutes', '1')).toBeNull();
    expect(validateSettingValue('global_rate_limit_window_minutes', '1440')).toBeNull();
    expect(validateSettingValue('auth_rate_limit_window_minutes', '1')).toBeNull();
    expect(validateSettingValue('auth_rate_limit_window_minutes', '1440')).toBeNull();
  });

  it('should reject invalid window minutes', () => {
    expect(validateSettingValue('global_rate_limit_window_minutes', '0')).toBeTruthy();
    expect(validateSettingValue('global_rate_limit_window_minutes', '1441')).toBeTruthy();
    expect(validateSettingValue('auth_rate_limit_window_minutes', '0')).toBeTruthy();
  });
});
