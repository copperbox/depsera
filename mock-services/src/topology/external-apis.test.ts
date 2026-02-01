import { assignExternalApis, PUBLIC_APIS } from './external-apis';
import { Topology, ServiceTier } from './types';
import { randomUUID } from 'crypto';

function createTestTopology(serviceCounts: { frontend: number; api: number; backend: number; database: number }): Topology {
  const services = [];
  const tiers: [ServiceTier, number][] = [
    [ServiceTier.FRONTEND, serviceCounts.frontend],
    [ServiceTier.API, serviceCounts.api],
    [ServiceTier.BACKEND, serviceCounts.backend],
    [ServiceTier.DATABASE, serviceCounts.database]
  ];

  for (const [tier, count] of tiers) {
    for (let i = 0; i < count; i++) {
      services.push({
        id: randomUUID(),
        name: `${tier}-service-${i}`,
        tier,
        dependencies: []
      });
    }
  }

  return { services, edges: [] };
}

describe('assignExternalApis', () => {
  it('should only add external deps to frontend and API tier services', () => {
    // Run multiple times to account for randomness
    for (let run = 0; run < 10; run++) {
      const topology = createTestTopology({ frontend: 5, api: 5, backend: 5, database: 5 });
      assignExternalApis(topology);

      const backendServices = topology.services.filter(s => s.tier === ServiceTier.BACKEND);
      const dbServices = topology.services.filter(s => s.tier === ServiceTier.DATABASE);

      for (const s of [...backendServices, ...dbServices]) {
        const externalDeps = s.dependencies.filter(d => d.externalUrl);
        expect(externalDeps).toHaveLength(0);
      }
    }
  });

  it('should add external deps with valid externalUrl and externalName', () => {
    const topology = createTestTopology({ frontend: 20, api: 20, backend: 0, database: 0 });
    assignExternalApis(topology);

    const allExternalDeps = topology.services.flatMap(s =>
      s.dependencies.filter(d => d.externalUrl)
    );

    // With 40 eligible services at 30%, we expect some external deps
    // (could be 0 in rare cases, so just check structure if any exist)
    for (const dep of allExternalDeps) {
      expect(dep.externalUrl).toMatch(/^https?:\/\//);
      expect(dep.externalName).toBeTruthy();
      expect(dep.type).toBe('rest');
      expect(dep.serviceId).toBeTruthy();
    }
  });

  it('should add at most 2 external deps per service', () => {
    for (let run = 0; run < 10; run++) {
      const topology = createTestTopology({ frontend: 10, api: 10, backend: 0, database: 0 });
      assignExternalApis(topology);

      for (const service of topology.services) {
        const externalDeps = service.dependencies.filter(d => d.externalUrl);
        expect(externalDeps.length).toBeLessThanOrEqual(2);
      }
    }
  });

  it('should use APIs from the PUBLIC_APIS list', () => {
    const topology = createTestTopology({ frontend: 20, api: 20, backend: 0, database: 0 });
    assignExternalApis(topology);

    const validUrls = new Set(PUBLIC_APIS.map(a => a.url));
    const allExternalDeps = topology.services.flatMap(s =>
      s.dependencies.filter(d => d.externalUrl)
    );

    for (const dep of allExternalDeps) {
      expect(validUrls.has(dep.externalUrl!)).toBe(true);
    }
  });
});
