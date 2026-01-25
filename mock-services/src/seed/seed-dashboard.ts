import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { ServiceRegistry } from '../services/service-registry';
import { ServiceTier } from '../topology/types';

export interface SeedConfig {
  databasePath: string;
  registry: ServiceRegistry;
  mockServicesBaseUrl: string;
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

function ensureMockTeam(db: Database.Database): string {
  const existing = db.prepare(
    `SELECT id FROM teams WHERE name = 'Mock Services'`
  ).get() as { id: string } | undefined;

  if (existing) {
    return existing.id;
  }

  const teamId = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO teams (id, name, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(teamId, 'Mock Services', 'Auto-generated mock services for testing', now, now);

  return teamId;
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
    const teamId = ensureMockTeam(db);
    console.log(`Using team ID: ${teamId}`);

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
      INSERT INTO dependencies (id, service_id, name, description, impact, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAssociation = db.prepare(`
      INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_auto_suggested, confidence_score, is_dismissed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      const serviceIdMap = new Map<string, string>();

      console.log(`Inserting ${services.length} services...`);
      for (const service of services) {
        const dashboardServiceId = randomUUID();
        serviceIdMap.set(service.id, dashboardServiceId);

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
          for (const depId of topoService.dependencies) {
            const depService = registry.getService(depId);
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
    console.log(`Successfully seeded ${services.length} mock services into dashboard database`);

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
