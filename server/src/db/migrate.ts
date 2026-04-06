import { Database } from 'better-sqlite3';
import logger from '../utils/logger';
import * as migration001 from './migrations/001_initial_schema';
import * as migration002 from './migrations/002_add_dependency_type';
import * as migration003 from './migrations/003_add_latency_history';
import * as migration004 from './migrations/004_add_check_details_and_errors';
import * as migration005 from './migrations/005_simplify_polling';
import * as migration006 from './migrations/006_add_dependency_aliases';
import * as migration007 from './migrations/007_poll_interval_ms';
import * as migration008 from './migrations/008_add_audit_log';
import * as migration009 from './migrations/009_add_settings';
import * as migration010 from './migrations/010_add_password_hash';
import * as migration011 from './migrations/011_add_alerts';
import * as migration012 from './migrations/012_add_schema_config';
import * as migration013 from './migrations/013_add_external_services';
import * as migration014 from './migrations/014_add_match_reason';
import * as migration015 from './migrations/015_relax_dependency_type';
import * as migration016 from './migrations/016_add_contact_column';
import * as migration017 from './migrations/017_add_instance_overrides';
import * as migration018 from './migrations/018_add_canonical_overrides';
import * as migration019 from './migrations/019_add_status_change_events';
import * as migration020 from './migrations/020_add_service_poll_history';
import * as migration021 from './migrations/021_add_performance_indexes';
import * as migration022 from './migrations/022_add_poll_warnings';
import * as migration023 from './migrations/023_add_skipped_column';
import * as migration024 from './migrations/024_add_manifest_sync';
import * as migration025 from './migrations/025_add_drift_flags';
import * as migration026 from './migrations/026_remove_auto_suggestions';
import * as migration027 from './migrations/027_add_team_key';
import * as migration028 from './migrations/028_add_team_contact';
import * as migration029 from './migrations/029_add_custom_alert_thresholds';
import * as migration030 from './migrations/030_add_alert_delay';
import * as migration031 from './migrations/031_add_alert_mutes';
import * as migration032 from './migrations/032_add_service_mutes';
import * as migration033 from './migrations/033_multi_manifest';
import * as migration034 from './migrations/034_add_otel_sources';
import * as migration035 from './migrations/035_api_key_rate_limit_columns';
import * as migration036 from './migrations/036_api_key_usage_buckets';
import * as migration037 from './migrations/037_add_trace_discovery';
import * as migration038 from './migrations/038_add_external_node_enrichment';
import * as migration039 from './migrations/039_add_percentile_latency';
import * as migration040 from './migrations/040_add_span_storage';
import * as migration041 from './migrations/041_add_span_retention_setting';

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
  },
  {
    id: '006',
    name: 'add_dependency_aliases',
    up: migration006.up,
    down: migration006.down
  },
  {
    id: '007',
    name: 'poll_interval_ms',
    up: migration007.up,
    down: migration007.down
  },
  {
    id: '008',
    name: 'add_audit_log',
    up: migration008.up,
    down: migration008.down
  },
  {
    id: '009',
    name: 'add_settings',
    up: migration009.up,
    down: migration009.down
  },
  {
    id: '010',
    name: 'add_password_hash',
    up: migration010.up,
    down: migration010.down
  },
  {
    id: '011',
    name: 'add_alerts',
    up: migration011.up,
    down: migration011.down
  },
  {
    id: '012',
    name: 'add_schema_config',
    up: migration012.up,
    down: migration012.down
  },
  {
    id: '013',
    name: 'add_external_services',
    up: migration013.up,
    down: migration013.down
  },
  {
    id: '014',
    name: 'add_match_reason',
    up: migration014.up,
    down: migration014.down
  },
  {
    id: '015',
    name: 'relax_dependency_type',
    up: migration015.up,
    down: migration015.down
  },
  {
    id: '016',
    name: 'add_contact_column',
    up: migration016.up,
    down: migration016.down
  },
  {
    id: '017',
    name: 'add_instance_overrides',
    up: migration017.up,
    down: migration017.down
  },
  {
    id: '018',
    name: 'add_canonical_overrides',
    up: migration018.up,
    down: migration018.down
  },
  {
    id: '019',
    name: 'add_status_change_events',
    up: migration019.up,
    down: migration019.down
  },
  {
    id: '020',
    name: 'add_service_poll_history',
    up: migration020.up,
    down: migration020.down
  },
  {
    id: '021',
    name: 'add_performance_indexes',
    up: migration021.up,
    down: migration021.down
  },
  {
    id: '022',
    name: 'add_poll_warnings',
    up: migration022.up,
    down: migration022.down
  },
  {
    id: '023',
    name: 'add_skipped_column',
    up: migration023.up,
    down: migration023.down
  },
  {
    id: '024',
    name: 'add_manifest_sync',
    up: migration024.up,
    down: migration024.down
  },
  {
    id: '025',
    name: 'add_drift_flags',
    up: migration025.up,
    down: migration025.down
  },
  {
    id: '026',
    name: 'remove_auto_suggestions',
    up: migration026.up,
    down: migration026.down
  },
  {
    id: '027',
    name: 'add_team_key',
    up: migration027.up,
    down: migration027.down
  },
  {
    id: '028',
    name: 'add_team_contact',
    up: migration028.up,
    down: migration028.down
  },
  {
    id: '029',
    name: 'add_custom_alert_thresholds',
    up: migration029.up,
    down: migration029.down
  },
  {
    id: '030',
    name: 'add_alert_delay',
    up: migration030.up,
    down: migration030.down
  },
  {
    id: '031',
    name: 'add_alert_mutes',
    up: migration031.up,
    down: migration031.down
  },
  {
    id: '032',
    name: 'add_service_mutes',
    up: migration032.up,
    down: migration032.down
  },
  {
    id: '033',
    name: 'multi_manifest',
    up: migration033.up,
    down: migration033.down
  },
  {
    id: '034',
    name: 'add_otel_sources',
    up: migration034.up,
    down: migration034.down
  },
  {
    id: '035',
    name: 'api_key_rate_limit_columns',
    up: migration035.up,
    down: migration035.down
  },
  {
    id: '036',
    name: 'api_key_usage_buckets',
    up: migration036.up,
    down: migration036.down
  },
  {
    id: '037',
    name: 'add_trace_discovery',
    up: migration037.up,
    down: migration037.down
  },
  {
    id: '038',
    name: 'add_external_node_enrichment',
    up: migration038.up,
    down: migration038.down
  },
  {
    id: '039',
    name: 'add_percentile_latency',
    up: migration039.up,
    down: migration039.down
  },
  {
    id: '040',
    name: 'add_span_storage',
    up: migration040.up,
    down: migration040.down
  },
  {
    id: '041',
    name: 'add_span_retention_setting',
    up: migration041.up,
    down: migration041.down
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
      logger.info({ id: migration.id, name: migration.name }, 'running migration');

      db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(
          migration.id,
          migration.name
        );
      })();

      logger.info({ id: migration.id }, 'migration completed');
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
    logger.info({ id: migration.id, name: migration.name }, 'rolling back migration');

    db.transaction(() => {
      migration.down(db);
      db.prepare('DELETE FROM _migrations WHERE id = ?').run(migration.id);
    })();

    logger.info({ id: migration.id }, 'rollback completed');

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
