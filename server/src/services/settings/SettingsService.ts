import { ISettingsStore } from '../../stores/interfaces/ISettingsStore';
import { Setting } from '../../db/types';
import logger from '../../utils/logger';

/**
 * Known settings keys with their default values and types.
 */
export interface SettingsDefaults {
  data_retention_days: number;
  retention_cleanup_time: string;
  default_poll_interval_ms: number;
  ssrf_allowlist: string;
  global_rate_limit: number;
  global_rate_limit_window_minutes: number;
  auth_rate_limit: number;
  auth_rate_limit_window_minutes: number;
  alert_cooldown_minutes: number;
  alert_rate_limit_per_hour: number;
}

export type SettingsKey = keyof SettingsDefaults;

const SETTINGS_KEYS: SettingsKey[] = [
  'data_retention_days',
  'retention_cleanup_time',
  'default_poll_interval_ms',
  'ssrf_allowlist',
  'global_rate_limit',
  'global_rate_limit_window_minutes',
  'auth_rate_limit',
  'auth_rate_limit_window_minutes',
  'alert_cooldown_minutes',
  'alert_rate_limit_per_hour',
];

/**
 * Env var mappings for bootstrapping defaults.
 * If no DB value exists, these env vars (or hardcoded defaults) are used.
 */
function getEnvDefaults(): SettingsDefaults {
  return {
    data_retention_days: parseInt(process.env.DATA_RETENTION_DAYS || '365', 10),
    retention_cleanup_time: process.env.RETENTION_CLEANUP_TIME || '02:00',
    default_poll_interval_ms: parseInt(process.env.DEFAULT_POLL_INTERVAL_MS || '30000', 10),
    ssrf_allowlist: process.env.SSRF_ALLOWLIST || '',
    global_rate_limit: parseInt(process.env.RATE_LIMIT_MAX || '3000', 10),
    global_rate_limit_window_minutes: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10) / 60000,
    auth_rate_limit: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
    auth_rate_limit_window_minutes: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '60000', 10) / 60000,
    alert_cooldown_minutes: parseInt(process.env.ALERT_COOLDOWN_MINUTES || '5', 10),
    alert_rate_limit_per_hour: parseInt(process.env.ALERT_RATE_LIMIT_PER_HOUR || '30', 10),
  };
}

/**
 * Validates a settings key is a known key.
 */
export function isValidSettingsKey(key: string): key is SettingsKey {
  return SETTINGS_KEYS.includes(key as SettingsKey);
}

/**
 * Returns the list of known settings keys.
 */
export function getSettingsKeys(): SettingsKey[] {
  return [...SETTINGS_KEYS];
}

/**
 * Validation rules for settings values.
 * Returns an error message if invalid, or null if valid.
 */
export function validateSettingValue(key: SettingsKey, value: string): string | null {
  switch (key) {
    case 'data_retention_days': {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 1 || n > 3650) return 'data_retention_days must be between 1 and 3650';
      return null;
    }
    case 'retention_cleanup_time': {
      if (!/^\d{2}:\d{2}$/.test(value)) return 'retention_cleanup_time must be in HH:MM format';
      const [hours, minutes] = value.split(':').map(Number);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return 'retention_cleanup_time must be a valid time';
      return null;
    }
    case 'default_poll_interval_ms': {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 5000 || n > 3600000) return 'default_poll_interval_ms must be between 5000 and 3600000';
      return null;
    }
    case 'ssrf_allowlist':
      return null; // freeform comma-separated, no strict validation
    case 'global_rate_limit': {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 1 || n > 10000) return 'global_rate_limit must be between 1 and 10000';
      return null;
    }
    case 'global_rate_limit_window_minutes': {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 1 || n > 1440) return 'global_rate_limit_window_minutes must be between 1 and 1440';
      return null;
    }
    case 'auth_rate_limit': {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 1 || n > 1000) return 'auth_rate_limit must be between 1 and 1000';
      return null;
    }
    case 'auth_rate_limit_window_minutes': {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 1 || n > 1440) return 'auth_rate_limit_window_minutes must be between 1 and 1440';
      return null;
    }
    case 'alert_cooldown_minutes': {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 0 || n > 1440) return 'alert_cooldown_minutes must be between 0 and 1440';
      return null;
    }
    case 'alert_rate_limit_per_hour': {
      const n = parseInt(value, 10);
      if (isNaN(n) || n < 1 || n > 1000) return 'alert_rate_limit_per_hour must be between 1 and 1000';
      return null;
    }
    default:
      return `Unknown setting: ${key}`;
  }
}

/**
 * SettingsService provides an in-memory cache over the settings store.
 * Other services read from this cache rather than re-querying the DB.
 */
export class SettingsService {
  private static instance: SettingsService | null = null;
  private cache: Map<string, string> = new Map();
  private defaults: SettingsDefaults;
  private store: ISettingsStore;

  constructor(store: ISettingsStore) {
    this.store = store;
    this.defaults = getEnvDefaults();
  }

  static getInstance(store: ISettingsStore): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService(store);
      SettingsService.instance.loadFromDatabase();
    }
    return SettingsService.instance;
  }

  /**
   * Returns the existing singleton instance, or null if not yet initialized.
   * Used by utility code (e.g. SSRF allowlist) that needs settings but
   * cannot provide a store reference.
   */
  static tryGetInstance(): SettingsService | null {
    return SettingsService.instance;
  }

  static resetInstance(): void {
    SettingsService.instance = null;
  }

  /**
   * Load all settings from DB into the cache.
   * Called once at startup.
   */
  loadFromDatabase(): void {
    const settings = this.store.findAll();
    this.cache.clear();
    for (const setting of settings) {
      if (setting.value !== null) {
        this.cache.set(setting.key, setting.value);
      }
    }
    logger.info({ count: settings.length }, 'settings loaded from database');
  }

  /**
   * Get a setting value. Returns the DB value if set, otherwise the env/default value.
   */
  get<K extends SettingsKey>(key: K): SettingsDefaults[K] {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return this.parseValue(key, cached);
    }
    return this.defaults[key];
  }

  /**
   * Get all settings as a record, merging defaults with DB overrides.
   */
  getAll(): Record<SettingsKey, { value: SettingsDefaults[SettingsKey]; source: 'database' | 'default' }> {
    const result = {} as Record<SettingsKey, { value: SettingsDefaults[SettingsKey]; source: 'database' | 'default' }>;
    for (const key of SETTINGS_KEYS) {
      const cached = this.cache.get(key);
      if (cached !== undefined) {
        result[key] = { value: this.parseValue(key, cached), source: 'database' };
      } else {
        result[key] = { value: this.defaults[key], source: 'default' };
      }
    }
    return result;
  }

  /**
   * Update one or more settings. Validates values before persisting.
   * Returns the updated settings.
   */
  update(
    updates: Partial<Record<SettingsKey, string | number>>,
    updatedBy: string,
  ): Setting[] {
    const entries: Array<{ key: string; value: string | null }> = [];

    for (const [key, value] of Object.entries(updates)) {
      if (!isValidSettingsKey(key)) {
        continue; // skip unknown keys
      }
      const strValue = String(value);
      const error = validateSettingValue(key, strValue);
      if (error) {
        throw new ValidationError(error, key);
      }
      entries.push({ key, value: strValue });
    }

    if (entries.length === 0) {
      return [];
    }

    const result = this.store.upsertMany(entries, updatedBy);

    // Refresh cache
    for (const entry of entries) {
      if (entry.value !== null) {
        this.cache.set(entry.key, entry.value);
      } else {
        this.cache.delete(entry.key);
      }
    }

    return result;
  }

  private parseValue<K extends SettingsKey>(key: K, value: string): SettingsDefaults[K] {
    const defaultValue = this.defaults[key];
    if (typeof defaultValue === 'number') {
      const parsed = parseFloat(value);
      return (isNaN(parsed) ? defaultValue : parsed) as SettingsDefaults[K];
    }
    return value as SettingsDefaults[K];
  }
}

// Import here to avoid circular dependency issues
import { ValidationError } from '../../utils/errors';
