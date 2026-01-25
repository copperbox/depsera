import { randomUUID } from 'crypto';
import {
  ServiceTier,
  TopologyConfig,
  Topology,
  GeneratedService,
  TierCounts,
  TopologyEdge,
  TierDistribution
} from './types';
import { generateServiceName, resetNameGenerator } from './service-names';

const DEFAULT_DISTRIBUTION: TierDistribution = {
  frontend: 0.2,
  api: 0.35,
  backend: 0.3,
  database: 0.15
};

const DEPENDENCY_RANGES: Record<ServiceTier, { min: number; max: number }> = {
  [ServiceTier.FRONTEND]: { min: 1, max: 3 },
  [ServiceTier.API]: { min: 1, max: 4 },
  [ServiceTier.BACKEND]: { min: 1, max: 2 },
  [ServiceTier.DATABASE]: { min: 0, max: 0 }
};

const TIER_ORDER: ServiceTier[] = [
  ServiceTier.FRONTEND,
  ServiceTier.API,
  ServiceTier.BACKEND,
  ServiceTier.DATABASE
];

function calculateTierCounts(total: number, distribution?: Partial<TierDistribution>): TierCounts {
  const dist = { ...DEFAULT_DISTRIBUTION, ...distribution };

  const sum = dist.frontend + dist.api + dist.backend + dist.database;
  const normalized = {
    frontend: dist.frontend / sum,
    api: dist.api / sum,
    backend: dist.backend / sum,
    database: dist.database / sum
  };

  const counts: TierCounts = {
    frontend: Math.max(1, Math.round(total * normalized.frontend)),
    api: Math.max(1, Math.round(total * normalized.api)),
    backend: Math.max(1, Math.round(total * normalized.backend)),
    database: Math.max(1, Math.round(total * normalized.database))
  };

  const currentTotal = counts.frontend + counts.api + counts.backend + counts.database;
  const diff = total - currentTotal;

  if (diff > 0) {
    counts.api += diff;
  } else if (diff < 0) {
    const tiers: (keyof TierCounts)[] = ['api', 'backend', 'frontend', 'database'];
    let remaining = Math.abs(diff);
    for (const tier of tiers) {
      if (remaining === 0) break;
      const reduction = Math.min(counts[tier] - 1, remaining);
      counts[tier] -= reduction;
      remaining -= reduction;
    }
  }

  return counts;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getNextTier(tier: ServiceTier): ServiceTier | null {
  const index = TIER_ORDER.indexOf(tier);
  if (index === -1 || index === TIER_ORDER.length - 1) {
    return null;
  }
  return TIER_ORDER[index + 1];
}

function selectRandomSubset<T>(array: T[], min: number, max: number): T[] {
  const count = Math.min(randomInt(min, max), array.length);
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function generateTopology(config: TopologyConfig): Topology {
  resetNameGenerator();

  const counts = calculateTierCounts(config.totalServices, config.tierDistribution);
  const services: GeneratedService[] = [];
  const edges: TopologyEdge[] = [];

  const servicesByTier: Record<ServiceTier, GeneratedService[]> = {
    [ServiceTier.FRONTEND]: [],
    [ServiceTier.API]: [],
    [ServiceTier.BACKEND]: [],
    [ServiceTier.DATABASE]: []
  };

  for (const tier of TIER_ORDER) {
    const count = counts[tier];
    for (let i = 0; i < count; i++) {
      const service: GeneratedService = {
        id: randomUUID(),
        name: generateServiceName(tier, i),
        tier,
        dependencies: []
      };
      services.push(service);
      servicesByTier[tier].push(service);
    }
  }

  for (const tier of TIER_ORDER) {
    const nextTier = getNextTier(tier);
    if (!nextTier) continue;

    const range = DEPENDENCY_RANGES[tier];
    const availableDeps = servicesByTier[nextTier];

    for (const service of servicesByTier[tier]) {
      const deps = selectRandomSubset(availableDeps, range.min, range.max);
      for (const dep of deps) {
        service.dependencies.push(dep.id);
        edges.push({ from: service.id, to: dep.id });
      }
    }
  }

  return { services, edges };
}

export function getTopologyStats(topology: Topology): Record<string, number> {
  const stats: Record<string, number> = {
    total: topology.services.length,
    edges: topology.edges.length
  };

  for (const tier of TIER_ORDER) {
    stats[tier] = topology.services.filter(s => s.tier === tier).length;
  }

  return stats;
}
