import { Database } from 'better-sqlite3';
import * as migration001 from './migrations/001_initial_schema';
import * as migration002 from './migrations/002_add_dependency_type';
import * as migration003 from './migrations/003_add_latency_history';
import * as migration004 from './migrations/004_add_check_details_and_errors';
import * as migration005 from './migrations/005_simplify_polling';

interface Migration {
  id: string;
  name: string;
  up: (db: Database) => void;
  down: (db: Database) => void;
}

const migrations: Migration[] = [
  {
    id: '001',
    name: 'initial_schema',
    up: migration001.up,
    down: migration001.down
  },
  {
    id: '002',
    name: 'add_dependency_type',
    up: migration002.up,
    down: migration002.down
  },
  {
    id: '003',
    name: 'add_latency_history',
    up: migration003.up,
    down: migration003.down
  },
  {
    id: '004',
    name: 'add_check_details_and_errors',
    up: migration004.up,
    down: migration004.down
  },
  {
    id: '005',
    name: 'simplify_polling',
    up: migration005.up,
    down: migration005.down
  }
];

function ensureMigrationsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function getAppliedMigrations(db: Database): Set<string> {
  const rows = db.prepare('SELECT id FROM _migrations').all() as { id: string }[];
  return new Set(rows.map(row => row.id));
}

export function runMigrations(db: Database): void {
  ensureMigrationsTable(db);
  const applied = getAppliedMigrations(db);

  for (const migration of migrations) {
    if (!applied.has(migration.id)) {
      console.log(`Running migration ${migration.id}: ${migration.name}`);

      db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(
          migration.id,
          migration.name
        );
      })();

      console.log(`Migration ${migration.id} completed`);
    }
  }
}

export function rollbackMigration(db: Database, targetId?: string): void {
  ensureMigrationsTable(db);
  const applied = getAppliedMigrations(db);

  // Get migrations in reverse order
  const toRollback = [...migrations]
    .reverse()
    .filter(m => applied.has(m.id))
    .filter(m => !targetId || m.id >= targetId);

  for (const migration of toRollback) {
    console.log(`Rolling back migration ${migration.id}: ${migration.name}`);

    db.transaction(() => {
      migration.down(db);
      db.prepare('DELETE FROM _migrations WHERE id = ?').run(migration.id);
    })();

    console.log(`Rollback ${migration.id} completed`);

    // If we have a target, stop after rolling back to it
    if (targetId && migration.id === targetId) {
      break;
    }
  }
}

export function getMigrationStatus(db: Database): { id: string; name: string; applied: boolean }[] {
  ensureMigrationsTable(db);
  const applied = getAppliedMigrations(db);

  return migrations.map(m => ({
    id: m.id,
    name: m.name,
    applied: applied.has(m.id)
  }));
}
