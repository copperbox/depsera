import { randomUUID } from 'crypto';
import {
  ServiceTier,
  TopologyConfig,
  Topology,
  GeneratedService,
  TierCounts,
  TopologyEdge,
  TierDistribution,
  DependencyType,
  ServiceDependency
} from './types';
import { generateServiceName, resetNameGenerator } from './service-names';
import { assignExternalApis } from './external-apis';

// Dependency types based on target service tier
const TIER_DEPENDENCY_TYPES: Record<ServiceTier, DependencyType[]> = {
  [ServiceTier.FRONTEND]: ['rest', 'graphql'],
  [ServiceTier.API]: ['rest', 'grpc', 'graphql', 'soap'],
  [ServiceTier.BACKEND]: ['rest', 'grpc', 'message_queue', 'cache'],
  [ServiceTier.DATABASE]: ['database']
};

const DEFAULT_DISTRIBUTION: TierDistribution = {
  frontend: 0.2,
  api: 0.35,
  backend: 0.3,
  database: 0.15
};

const DEPENDENCY_RANGES: Record<ServiceTier, { min: number; max: number }> = {
  [ServiceTier.FRONTEND]: { min: 1, max: 4 },
  [ServiceTier.API]: { min: 1, max: 5 },
  [ServiceTier.BACKEND]: { min: 1, max: 3 },
  [ServiceTier.DATABASE]: { min: 0, max: 0 }
};

// Probability of adding a cross-tier dependency (skipping one or more tiers)
const CROSS_TIER_PROBABILITY = 0.3;

// Maximum additional cross-tier dependencies per service
const MAX_CROSS_TIER_DEPS = 2;

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

// Get all tiers below the given tier (for cross-tier dependencies)
function getLowerTiers(tier: ServiceTier): ServiceTier[] {
  const index = TIER_ORDER.indexOf(tier);
  if (index === -1 || index === TIER_ORDER.length - 1) {
    return [];
  }
  return TIER_ORDER.slice(index + 1);
}

// Get tiers that can be skipped to (more than one tier below)
function getSkipTiers(tier: ServiceTier): ServiceTier[] {
  const index = TIER_ORDER.indexOf(tier);
  if (index === -1 || index >= TIER_ORDER.length - 2) {
    return [];
  }
  // Return all tiers beyond the immediate next tier
  return TIER_ORDER.slice(index + 2);
}

function selectRandomSubset<T>(array: T[], min: number, max: number): T[] {
  const count = Math.min(randomInt(min, max), array.length);
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function getDependencyType(targetTier: ServiceTier): DependencyType {
  const types = TIER_DEPENDENCY_TYPES[targetTier];
  return types[randomInt(0, types.length - 1)];
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
      // Add standard dependencies to the next tier
      const deps = selectRandomSubset(availableDeps, range.min, range.max);
      for (const dep of deps) {
        const depType = getDependencyType(dep.tier);
        service.dependencies.push({
          serviceId: dep.id,
          type: depType
        });
        edges.push({ from: service.id, to: dep.id });
      }

      // Add cross-tier dependencies (skip tiers) with some probability
      const skipTiers = getSkipTiers(tier);
      if (skipTiers.length > 0 && Math.random() < CROSS_TIER_PROBABILITY) {
        // Collect all services from skip-able tiers
        const skipTierServices: GeneratedService[] = [];
        for (const skipTier of skipTiers) {
          skipTierServices.push(...servicesByTier[skipTier]);
        }

        if (skipTierServices.length > 0) {
          // Add 1 to MAX_CROSS_TIER_DEPS cross-tier dependencies
          const crossTierCount = randomInt(1, Math.min(MAX_CROSS_TIER_DEPS, skipTierServices.length));
          const crossDeps = selectRandomSubset(skipTierServices, crossTierCount, crossTierCount);

          for (const dep of crossDeps) {
            // Avoid duplicate dependencies
            if (!service.dependencies.some(d => d.serviceId === dep.id)) {
              const depType = getDependencyType(dep.tier);
              service.dependencies.push({
                serviceId: dep.id,
                type: depType
              });
              edges.push({ from: service.id, to: dep.id });
            }
          }
        }
      }
    }
  }

  const topology = { services, edges };
  assignExternalApis(topology);
  return topology;
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
