export enum ServiceTier {
  FRONTEND = 'frontend',
  API = 'api',
  BACKEND = 'backend',
  DATABASE = 'database'
}

export interface TierDistribution {
  frontend: number;
  api: number;
  backend: number;
  database: number;
}

export interface TopologyConfig {
  totalServices: number;
  tierDistribution?: Partial<TierDistribution>;
}

export interface GeneratedService {
  id: string;
  name: string;
  tier: ServiceTier;
  dependencies: string[];
}

export interface TopologyEdge {
  from: string;
  to: string;
}

export interface Topology {
  services: GeneratedService[];
  edges: TopologyEdge[];
}

export interface TierCounts {
  frontend: number;
  api: number;
  backend: number;
  database: number;
}
