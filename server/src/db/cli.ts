#!/usr/bin/env ts-node
/**
 * Database CLI for migrations
 *
 * Usage:
 *   npx ts-node src/db/cli.ts migrate          - Run pending migrations
 *   npx ts-node src/db/cli.ts rollback         - Rollback last migration
 *   npx ts-node src/db/cli.ts rollback 001     - Rollback to specific migration
 *   npx ts-node src/db/cli.ts status           - Show migration status
 *   npx ts-node src/db/cli.ts clear            - Clear all data (dangerous!)
 *   npx ts-node src/db/cli.ts clear-services   - Clear all services
 */

import { db } from './index';
import { runMigrations, rollbackMigration, getMigrationStatus } from './migrate';
import { clearDatabase, clearServices } from './seed';

const command = process.argv[2];
const args = process.argv.slice(3);

function printUsage(): void {
  console.log(`
Database CLI

Commands:
  migrate              Run pending migrations
  rollback [id]        Rollback migrations (optionally to specific id)
  status               Show migration status
  clear                Clear all data from the database (dangerous!)
  clear-services       Clear all services (and their dependencies)
  `);
}

async function main(): Promise<void> {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  switch (command) {
    case 'migrate':
      runMigrations(db);
      break;

    case 'rollback':
      rollbackMigration(db, args[0]);
      break;

    case 'status': {
      const status = getMigrationStatus(db);
      console.log('\nMigration Status:');
      console.log('─'.repeat(50));
      for (const m of status) {
        const icon = m.applied ? '✓' : '○';
        console.log(`  ${icon} ${m.id}: ${m.name}`);
      }
      console.log('');
      break;
    }

    case 'clear':
      if (!args.includes('--force')) {
        console.log('This will delete ALL data. Use --force to confirm.');
        process.exit(1);
      }
      clearDatabase(db);
      break;

    case 'clear-services':
      clearServices(db);
      break;

    default:
      printUsage();
      process.exit(1);
  }

  db.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
