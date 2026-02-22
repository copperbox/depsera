import { Database } from 'better-sqlite3';
import { Setting } from '../../db/types';
import { ISettingsStore } from '../interfaces/ISettingsStore';

export class SettingsStore implements ISettingsStore {
  constructor(private db: Database) {}

  findAll(): Setting[] {
    return this.db
      .prepare('SELECT * FROM settings ORDER BY key')
      .all() as Setting[];
  }

  findByKey(key: string): Setting | undefined {
    return this.db
      .prepare('SELECT * FROM settings WHERE key = ?')
      .get(key) as Setting | undefined;
  }

  upsert(key: string, value: string | null, updatedBy: string): Setting {
    this.db
      .prepare(`
        INSERT INTO settings (key, value, updated_at, updated_by)
        VALUES (?, ?, datetime('now'), ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `)
      .run(key, value, updatedBy);

    return this.db
      .prepare('SELECT * FROM settings WHERE key = ?')
      .get(key) as Setting;
  }

  upsertMany(entries: Array<{ key: string; value: string | null }>, updatedBy: string): Setting[] {
    const upsertStmt = this.db.prepare(`
      INSERT INTO settings (key, value, updated_at, updated_by)
      VALUES (?, ?, datetime('now'), ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `);

    const transaction = this.db.transaction((items: Array<{ key: string; value: string | null }>) => {
      for (const item of items) {
        upsertStmt.run(item.key, item.value, updatedBy);
      }
    });

    transaction(entries);

    const keys = entries.map(e => e.key);
    const placeholders = keys.map(() => '?').join(', ');
    return this.db
      .prepare(`SELECT * FROM settings WHERE key IN (${placeholders}) ORDER BY key`)
      .all(...keys) as Setting[];
  }

  delete(key: string): boolean {
    const result = this.db
      .prepare('DELETE FROM settings WHERE key = ?')
      .run(key);
    return result.changes > 0;
  }
}
