import { Database } from 'better-sqlite3';

export function clearDatabase(db: Database): void {
  console.log('Clearing all data from database...');

  db.exec(`
    DELETE FROM dependency_associations;
    DELETE FROM dependencies;
    DELETE FROM services;
    DELETE FROM team_members;
    DELETE FROM teams;
    DELETE FROM users;
  `);

  console.log('Database cleared');
}

export function clearServices(db: Database): void {
  // Get count before clearing
  const { count } = db.prepare('SELECT COUNT(*) as count FROM services').get() as { count: number };

  if (count === 0) {
    console.log('No services to clear');
    return;
  }

  console.log(`Clearing ${count} services from database...`);

  // Dependencies and associations are deleted via CASCADE
  db.exec('DELETE FROM services');

  console.log('All services cleared');
}
