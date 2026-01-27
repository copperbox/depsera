#!/usr/bin/env ts-node
/**
 * Database CLI for migrations and seeding
 *
 * Usage:
 *   npx ts-node src/db/cli.ts migrate          - Run pending migrations
 *   npx ts-node src/db/cli.ts rollback         - Rollback last migration
 *   npx ts-node src/db/cli.ts rollback 001     - Rollback to specific migration
 *   npx ts-node src/db/cli.ts status           - Show migration status
 *   npx ts-node src/db/cli.ts seed             - Seed the database
 *   npx ts-node src/db/cli.ts clear            - Clear all data (dangerous!)
 *   npx ts-node src/db/cli.ts clear-services   - Clear all services
 *   npx ts-node src/db/cli.ts reseed           - Clear and reseed services/teams
 *   npx ts-node src/db/cli.ts reseed --count=50 - Reseed with N mock services
 */

import { db } from './index';
import { runMigrations, rollbackMigration, getMigrationStatus } from './migrate';
import { seedDatabase, clearDatabase, clearServices, clearServicesAndTeams, ensureTeams } from './seed';

const command = process.argv[2];
const args = process.argv.slice(3);

// Parse --key=value arguments
function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      parsed[key] = value || 'true';
    }
  }
  return parsed;
}

function printUsage(): void {
  console.log(`
Database CLI

Commands:
  migrate              Run pending migrations
  rollback [id]        Rollback migrations (optionally to specific id)
  status               Show migration status
  seed                 Seed the database with development data
  clear                Clear all data from the database (dangerous!)
  clear-services       Clear all services (and their dependencies)
  reseed [--count=N]   Clear services/teams and reseed with N mock services (default: 20)
                       Uses mock-services topology generator for service creation
  `);
}

async function main(): Promise<void> {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  const parsedArgs = parseArgs(args);

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

    case 'seed':
      // Run migrations first to ensure tables exist
      runMigrations(db);
      seedDatabase(db);
      break;

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

    case 'reseed': {
      const count = parseInt(parsedArgs.count || '20', 10);
      if (isNaN(count) || count < 1) {
        console.error('Invalid count. Please provide a positive number.');
        process.exit(1);
      }

      console.log(`\nReseed operation:`);
      console.log(`  Service count: ${count}`);
      console.log('');

      // Step 1: Clear existing services and teams
      clearServicesAndTeams(db);

      // Step 2: Create teams
      console.log('\nCreating teams...');
      const teamIds = ensureTeams(db);
      console.log(`Created ${Object.keys(teamIds).length} teams`);

      // Step 3: Provide instructions for generating mock services
      console.log(`
To complete the reseed, run the following command from the project root:

  cd mock-services && npm run dev -- --count=${count} --seed --new-topology

This will:
  1. Generate ${count} mock services with random topology
  2. Seed them into the dashboard database with team assignments
  3. Start the mock services for health polling
`);
      break;
    }

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
