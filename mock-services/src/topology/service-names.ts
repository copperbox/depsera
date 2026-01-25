import { ServiceTier } from './types';

interface NamePool {
  prefixes: string[];
  suffixes: string[];
}

const SERVICE_NAME_POOLS: Record<ServiceTier, NamePool> = {
  [ServiceTier.FRONTEND]: {
    prefixes: ['gateway', 'web', 'portal', 'dashboard', 'app', 'client', 'mobile', 'admin'],
    suffixes: ['api', 'bff', 'proxy', 'router', 'edge']
  },
  [ServiceTier.API]: {
    prefixes: [
      'order', 'user', 'payment', 'inventory', 'shipping', 'cart',
      'catalog', 'pricing', 'search', 'auth', 'notification', 'account',
      'product', 'review', 'recommendation', 'analytics', 'billing'
    ],
    suffixes: ['service', 'api', 'svc']
  },
  [ServiceTier.BACKEND]: {
    prefixes: [
      'queue', 'worker', 'processor', 'scheduler', 'aggregator',
      'transformer', 'validator', 'cache', 'event', 'stream', 'batch'
    ],
    suffixes: ['handler', 'engine', 'core', 'worker']
  },
  [ServiceTier.DATABASE]: {
    prefixes: ['db', 'cache', 'store', 'data'],
    suffixes: ['postgres', 'redis', 'mongo', 'elasticsearch', 'mysql', 'memcached']
  }
};

const usedNames = new Set<string>();

export function resetNameGenerator(): void {
  usedNames.clear();
}

export function generateServiceName(tier: ServiceTier, index: number): string {
  const pool = SERVICE_NAME_POOLS[tier];
  const prefix = pool.prefixes[index % pool.prefixes.length];
  const suffix = pool.suffixes[index % pool.suffixes.length];

  let name = `${prefix}-${suffix}`;

  if (usedNames.has(name)) {
    const instanceNum = Math.floor(index / pool.prefixes.length) + 1;
    name = `${prefix}-${suffix}-${instanceNum}`;
  }

  while (usedNames.has(name)) {
    name = `${prefix}-${suffix}-${index + 1}`;
  }

  usedNames.add(name);
  return name;
}

export function generateServiceNames(tier: ServiceTier, count: number): string[] {
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    names.push(generateServiceName(tier, i));
  }
  return names;
}
