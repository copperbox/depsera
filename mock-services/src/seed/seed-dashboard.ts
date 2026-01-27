import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { ServiceRegistry } from '../services/service-registry';
import { ServiceTier } from '../topology/types';

export interface SeedConfig {
  databasePath: string;
  registry: ServiceRegistry;
  mockServicesBaseUrl: string;
}

// Team definitions matching the server's seed.ts
interface TeamDefinition {
  name: string;
  description: string;
}

const TEAMS: Record<string, TeamDefinition> = {
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
const SERVICE_TEAM_MAPPING: Record<string, string> = {
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
function getTeamKeyForService(serviceName: string): string {
  const lowerName = serviceName.toLowerCase();

  for (const [prefix, teamKey] of Object.entries(SERVICE_TEAM_MAPPING)) {
    if (lowerName.startsWith(prefix)) {
      return teamKey;
    }
  }

  // Default to platform for unmatched services
  return 'platform';
}

function getAssociationType(tier: ServiceTier): string {
  switch (tier) {
    case ServiceTier.DATABASE:
      return 'database';
    case ServiceTier.BACKEND:
      return 'cache';
    default:
      return 'api_call';
  }
}

/**
 * Ensure all defined teams exist in the database
 * Returns a map of team keys to team IDs
 */
function ensureTeams(db: Database.Database): Record<string, string> {
  const teamIds: Record<string, string> = {};
  const now = new Date().toISOString();

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
        INSERT INTO teams (id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(teamId, team.name, team.description, now, now);
      console.log(`Created team: ${team.name}`);
    }
  }

  return teamIds;
}

function clearExistingMockServices(db: Database.Database, baseUrl: string): void {
  const services = db.prepare(`
    SELECT id FROM services WHERE health_endpoint LIKE ?
  `).all(`${baseUrl}%`) as { id: string }[];

  for (const service of services) {
    db.prepare(`DELETE FROM dependency_associations WHERE dependency_id IN (SELECT id FROM dependencies WHERE service_id = ?)`).run(service.id);
    db.prepare(`DELETE FROM dependencies WHERE service_id = ?`).run(service.id);
  }

  db.prepare(`
    DELETE FROM services WHERE health_endpoint LIKE ?
  `).run(`${baseUrl}%`);
}

export function seedMockServices(config: SeedConfig): void {
  const { databasePath, registry, mockServicesBaseUrl } = config;

  console.log(`Opening database at ${databasePath}...`);
  const db = new Database(databasePath);

  db.pragma('foreign_keys = ON');

  try {
    // Ensure all teams exist and get their IDs
    const teamIds = ensureTeams(db);
    console.log(`Teams ready: ${Object.keys(teamIds).join(', ')}`);

    console.log('Clearing existing mock services...');
    clearExistingMockServices(db, mockServicesBaseUrl);

    const services = registry.getAllServices();
    const topology = registry.getTopology();
    const now = new Date().toISOString();

    const insertService = db.prepare(`
      INSERT INTO services (id, name, team_id, health_endpoint, metrics_endpoint, polling_interval, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertDependency = db.prepare(`
      INSERT INTO dependencies (id, service_id, name, description, impact, type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAssociation = db.prepare(`
      INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_auto_suggested, confidence_score, is_dismissed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Track team assignment counts for logging
    const teamCounts: Record<string, number> = {};
    for (const key of Object.keys(TEAMS)) {
      teamCounts[key] = 0;
    }

    const transaction = db.transaction(() => {
      const serviceIdMap = new Map<string, string>();

      console.log(`Inserting ${services.length} services...`);
      for (const service of services) {
        const dashboardServiceId = randomUUID();
        serviceIdMap.set(service.id, dashboardServiceId);

        // Determine team based on service name
        const teamKey = getTeamKeyForService(service.name);
        const teamId = teamIds[teamKey];
        teamCounts[teamKey]++;

        insertService.run(
          dashboardServiceId,
          service.name,
          teamId,
          `${mockServicesBaseUrl}/${service.name}/dependencies`,
          `${mockServicesBaseUrl}/${service.name}/metrics`,
          30,
          1,
          now,
          now
        );
      }

      console.log('Creating dependencies and associations...');
      for (const service of services) {
        const dashboardServiceId = serviceIdMap.get(service.id)!;
        const topoService = topology.services.find(s => s.id === service.id);

        if (topoService && topoService.dependencies.length > 0) {
          for (const topoDep of topoService.dependencies) {
            const depService = registry.getService(topoDep.serviceId);
            if (depService) {
              const depDashboardId = serviceIdMap.get(depService.id);
              if (depDashboardId) {
                const dependencyId = randomUUID();

                insertDependency.run(
                  dependencyId,
                  dashboardServiceId,
                  depService.name,
                  `Dependency on ${depService.name}`,
                  `Service may fail if ${depService.name} is unavailable`,
                  topoDep.type,
                  now,
                  now
                );

                insertAssociation.run(
                  randomUUID(),
                  dependencyId,
                  depDashboardId,
                  getAssociationType(depService.tier),
                  1,
                  100,
                  0,
                  now
                );
              }
            }
          }
        }
      }
    });

    transaction();

    // Log team distribution
    console.log('\nTeam distribution:');
    for (const [teamKey, count] of Object.entries(teamCounts)) {
      if (count > 0) {
        console.log(`  ${TEAMS[teamKey].name}: ${count} services`);
      }
    }

    console.log(`\nSuccessfully seeded ${services.length} mock services into dashboard database`);

  } finally {
    db.close();
  }
}

export function clearMockServices(databasePath: string, baseUrl: string): void {
  console.log(`Opening database at ${databasePath}...`);
  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');

  try {
    console.log('Clearing mock services...');
    clearExistingMockServices(db, baseUrl);
    console.log('Mock services cleared');
  } finally {
    db.close();
  }
}
