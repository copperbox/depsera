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

export type DependencyType =
  | 'database'
  | 'rest'
  | 'soap'
  | 'grpc'
  | 'graphql'
  | 'message_queue'
  | 'cache'
  | 'file_system'
  | 'smtp'
  | 'other';

export interface ServiceDependency {
  serviceId: string;
  type: DependencyType;
}

export interface GeneratedService {
  id: string;
  name: string;
  tier: ServiceTier;
  dependencies: ServiceDependency[];
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
