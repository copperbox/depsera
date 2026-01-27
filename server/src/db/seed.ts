import { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

// Team definitions for consistent use across the application
export interface TeamDefinition {
  name: string;
  description: string;
}

export const TEAMS: Record<string, TeamDefinition> = {
  platform: {
    name: 'Platform',
    description: 'Core platform services, infrastructure, and shared tooling'
  },
  payments: {
    name: 'Payments',
    description: 'Payment processing, billing, and financial transaction services'
  },
  identity: {
    name: 'Identity',
    description: 'Authentication, authorization, and user identity management'
  },
  frontend: {
    name: 'Frontend',
    description: 'Web and mobile client applications, BFF services, and UI components'
  },
  data: {
    name: 'Data',
    description: 'Data infrastructure, analytics, caching, and database services'
  }
};

// Mapping of service name prefixes to team keys
export const SERVICE_TEAM_MAPPING: Record<string, string> = {
  // Identity team
  'auth': 'identity',
  'user': 'identity',
  'account': 'identity',
  'identity': 'identity',

  // Payments team
  'payment': 'payments',
  'billing': 'payments',
  'pricing': 'payments',
  'order': 'payments',
  'cart': 'payments',

  // Frontend team
  'gateway': 'frontend',
  'web': 'frontend',
  'portal': 'frontend',
  'dashboard': 'frontend',
  'app': 'frontend',
  'client': 'frontend',
  'mobile': 'frontend',
  'admin': 'frontend',

  // Data team
  'db': 'data',
  'cache': 'data',
  'store': 'data',
  'data': 'data',
  'queue': 'data',
  'stream': 'data',
  'event': 'data',
  'analytics': 'data',

  // Platform team (default for backend services)
  'worker': 'platform',
  'processor': 'platform',
  'scheduler': 'platform',
  'aggregator': 'platform',
  'transformer': 'platform',
  'validator': 'platform',
  'batch': 'platform',
  'inventory': 'platform',
  'shipping': 'platform',
  'catalog': 'platform',
  'search': 'platform',
  'notification': 'platform',
  'product': 'platform',
  'review': 'platform',
  'recommendation': 'platform'
};

/**
 * Get the team key for a given service name based on prefix matching
 */
export function getTeamKeyForService(serviceName: string): string {
  const lowerName = serviceName.toLowerCase();

  for (const [prefix, teamKey] of Object.entries(SERVICE_TEAM_MAPPING)) {
    if (lowerName.startsWith(prefix)) {
      return teamKey;
    }
  }

  // Default to platform for unmatched services
  return 'platform';
}

export function seedDatabase(db: Database): void {
  // Check if data already exists
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count > 0) {
    console.log('Database already seeded, skipping...');
    return;
  }

  console.log('Seeding database with development data...');

  // Create admin user
  const adminId = randomUUID();
  db.prepare(`
    INSERT INTO users (id, email, name, role)
    VALUES (?, ?, ?, ?)
  `).run(adminId, 'admin@example.com', 'Admin User', 'admin');

  // Create regular users
  const user1Id = randomUUID();
  const user2Id = randomUUID();
  const user3Id = randomUUID();
  const user4Id = randomUUID();
  const user5Id = randomUUID();

  db.prepare(`
    INSERT INTO users (id, email, name, role)
    VALUES (?, ?, ?, ?)
  `).run(user1Id, 'alice@example.com', 'Alice Johnson', 'user');

  db.prepare(`
    INSERT INTO users (id, email, name, role)
    VALUES (?, ?, ?, ?)
  `).run(user2Id, 'bob@example.com', 'Bob Smith', 'user');

  db.prepare(`
    INSERT INTO users (id, email, name, role)
    VALUES (?, ?, ?, ?)
  `).run(user3Id, 'charlie@example.com', 'Charlie Brown', 'user');

  db.prepare(`
    INSERT INTO users (id, email, name, role)
    VALUES (?, ?, ?, ?)
  `).run(user4Id, 'dana@example.com', 'Dana Lee', 'user');

  db.prepare(`
    INSERT INTO users (id, email, name, role)
    VALUES (?, ?, ?, ?)
  `).run(user5Id, 'eve@example.com', 'Eve Martinez', 'user');

  // Create teams
  const teamIds: Record<string, string> = {};

  for (const [key, team] of Object.entries(TEAMS)) {
    const teamId = randomUUID();
    teamIds[key] = teamId;
    db.prepare(`
      INSERT INTO teams (id, name, description)
      VALUES (?, ?, ?)
    `).run(teamId, team.name, team.description);
  }

  // Assign users to teams
  // Platform team
  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(teamIds.platform, adminId, 'lead');

  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(teamIds.platform, user1Id, 'member');

  // Payments team
  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(teamIds.payments, user1Id, 'lead');

  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(teamIds.payments, user2Id, 'member');

  // Identity team
  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(teamIds.identity, user3Id, 'lead');

  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(teamIds.identity, adminId, 'member');

  // Frontend team
  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(teamIds.frontend, user4Id, 'lead');

  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(teamIds.frontend, user2Id, 'member');

  // Data team
  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(teamIds.data, user5Id, 'lead');

  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(teamIds.data, user3Id, 'member');

  // Create services with logical team assignments
  const userServiceId = randomUUID();
  const authServiceId = randomUUID();
  const paymentServiceId = randomUUID();
  const notificationServiceId = randomUUID();

  db.prepare(`
    INSERT INTO services (id, name, team_id, health_endpoint, metrics_endpoint, polling_interval)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    userServiceId,
    'User Service',
    teamIds.identity,  // Identity team owns user management
    'http://localhost:4001/dependencies',
    'http://localhost:4001/metrics',
    30
  );

  db.prepare(`
    INSERT INTO services (id, name, team_id, health_endpoint, metrics_endpoint, polling_interval)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    authServiceId,
    'Auth Service',
    teamIds.identity,  // Identity team owns authentication
    'http://localhost:4002/dependencies',
    'http://localhost:4002/metrics',
    30
  );

  db.prepare(`
    INSERT INTO services (id, name, team_id, health_endpoint, metrics_endpoint, polling_interval)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    paymentServiceId,
    'Payment Service',
    teamIds.payments,  // Payments team owns payment processing
    'http://localhost:4003/dependencies',
    'http://localhost:4003/metrics',
    15
  );

  db.prepare(`
    INSERT INTO services (id, name, team_id, health_endpoint, metrics_endpoint, polling_interval)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    notificationServiceId,
    'Notification Service',
    teamIds.platform,  // Platform team owns notification infrastructure
    'http://localhost:4004/dependencies',
    'http://localhost:4004/metrics',
    60
  );

  // Create sample dependencies
  const dep1Id = randomUUID();
  const dep2Id = randomUUID();
  const dep3Id = randomUUID();
  const dep4Id = randomUUID();
  const dep5Id = randomUUID();

  // User Service dependencies
  db.prepare(`
    INSERT INTO dependencies (id, service_id, name, description, impact, healthy, health_state, latency_ms, last_checked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    dep1Id,
    userServiceId,
    'PostgreSQL Database',
    'Primary user data store',
    'Users cannot be created or retrieved',
    1,
    0,
    5,
  );

  db.prepare(`
    INSERT INTO dependencies (id, service_id, name, description, impact, healthy, health_state, latency_ms, last_checked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    dep2Id,
    userServiceId,
    'Redis Cache',
    'Session and cache storage',
    'Degraded performance, sessions may be lost',
    1,
    0,
    2,
  );

  // Auth Service dependencies
  db.prepare(`
    INSERT INTO dependencies (id, service_id, name, description, impact, healthy, health_state, latency_ms, last_checked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    dep3Id,
    authServiceId,
    'User Service',
    'User data for authentication',
    'Authentication will fail',
    1,
    0,
    15,
  );

  // Payment Service dependencies
  db.prepare(`
    INSERT INTO dependencies (id, service_id, name, description, impact, healthy, health_state, latency_ms, last_checked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    dep4Id,
    paymentServiceId,
    'Stripe API',
    'Payment processing provider',
    'Payments cannot be processed',
    1,
    0,
    120,
  );

  db.prepare(`
    INSERT INTO dependencies (id, service_id, name, description, impact, healthy, health_state, latency_ms, last_checked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    dep5Id,
    paymentServiceId,
    'Auth Service',
    'User authentication verification',
    'Payment authorization will fail',
    1,
    0,
    10,
  );

  // Create dependency associations (linking dependencies to services)
  // Auth Service depends on User Service
  db.prepare(`
    INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_auto_suggested, confidence_score)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    dep3Id,
    userServiceId,
    'api_call',
    1,
    100
  );

  // Payment Service depends on Auth Service
  db.prepare(`
    INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_auto_suggested, confidence_score)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    dep5Id,
    authServiceId,
    'api_call',
    1,
    100
  );

  console.log('Database seeded successfully');
}

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

/**
 * Clear services and teams, keeping users intact
 */
export function clearServicesAndTeams(db: Database): void {
  console.log('Clearing services and teams...');

  db.exec(`
    DELETE FROM dependency_associations;
    DELETE FROM dependencies;
    DELETE FROM services;
    DELETE FROM team_members;
    DELETE FROM teams;
  `);

  console.log('Services and teams cleared');
}

/**
 * Ensure all defined teams exist in the database, creating them if needed
 * Returns a map of team keys to team IDs
 */
export function ensureTeams(db: Database): Record<string, string> {
  const teamIds: Record<string, string> = {};

  for (const [key, team] of Object.entries(TEAMS)) {
    const existing = db.prepare(
      `SELECT id FROM teams WHERE name = ?`
    ).get(team.name) as { id: string } | undefined;

    if (existing) {
      teamIds[key] = existing.id;
    } else {
      const teamId = randomUUID();
      teamIds[key] = teamId;
      db.prepare(`
        INSERT INTO teams (id, name, description)
        VALUES (?, ?, ?)
      `).run(teamId, team.name, team.description);
      console.log(`Created team: ${team.name}`);
    }
  }

  return teamIds;
}

/**
 * Get team ID by team key, creating teams if necessary
 */
export function getTeamId(db: Database, teamKey: string): string {
  const team = TEAMS[teamKey];
  if (!team) {
    throw new Error(`Unknown team key: ${teamKey}`);
  }

  const existing = db.prepare(
    `SELECT id FROM teams WHERE name = ?`
  ).get(team.name) as { id: string } | undefined;

  if (existing) {
    return existing.id;
  }

  // Create the team if it doesn't exist
  const teamId = randomUUID();
  db.prepare(`
    INSERT INTO teams (id, name, description)
    VALUES (?, ?, ?)
  `).run(teamId, team.name, team.description);

  return teamId;
}
