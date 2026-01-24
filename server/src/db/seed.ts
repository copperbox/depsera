import { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

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

  // Create teams
  const platformTeamId = randomUUID();
  const paymentsTeamId = randomUUID();
  const notificationsTeamId = randomUUID();

  db.prepare(`
    INSERT INTO teams (id, name, description)
    VALUES (?, ?, ?)
  `).run(platformTeamId, 'Platform', 'Core platform services and infrastructure');

  db.prepare(`
    INSERT INTO teams (id, name, description)
    VALUES (?, ?, ?)
  `).run(paymentsTeamId, 'Payments', 'Payment processing and billing services');

  db.prepare(`
    INSERT INTO teams (id, name, description)
    VALUES (?, ?, ?)
  `).run(notificationsTeamId, 'Notifications', 'Email, SMS, and push notification services');

  // Assign users to teams
  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(platformTeamId, adminId, 'lead');

  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(platformTeamId, user1Id, 'member');

  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(paymentsTeamId, user1Id, 'lead');

  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(paymentsTeamId, user2Id, 'member');

  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(notificationsTeamId, user2Id, 'lead');

  db.prepare(`
    INSERT INTO team_members (team_id, user_id, role)
    VALUES (?, ?, ?)
  `).run(notificationsTeamId, user3Id, 'member');

  // Create services
  const userServiceId = randomUUID();
  const authServiceId = randomUUID();
  const paymentServiceId = randomUUID();
  const emailServiceId = randomUUID();

  db.prepare(`
    INSERT INTO services (id, name, team_id, health_endpoint, metrics_endpoint, polling_interval)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    userServiceId,
    'User Service',
    platformTeamId,
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
    platformTeamId,
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
    paymentsTeamId,
    'http://localhost:4003/dependencies',
    'http://localhost:4003/metrics',
    15
  );

  db.prepare(`
    INSERT INTO services (id, name, team_id, health_endpoint, metrics_endpoint, polling_interval)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    emailServiceId,
    'Email Service',
    notificationsTeamId,
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
