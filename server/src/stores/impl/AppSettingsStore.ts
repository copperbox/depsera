import { Database } from 'better-sqlite3';
import { IAppSettingsStore } from '../interfaces/IAppSettingsStore';

export class AppSettingsStore implements IAppSettingsStore {
  constructor(private db: Database) {}

  get(key: string): string | undefined {
    const row = this.db
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value;
  }

  set(key: string, value: string, updatedBy?: string): void {
    this.db
      .prepare(`
        INSERT INTO app_settings (key, value, updated_at, updated_by)
        VALUES (?, ?, datetime('now'), ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `)
      .run(key, value, updatedBy ?? null);
  }
}
