import { ServiceTier } from '../topology/types';
import { FailureState } from '../failures/types';

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

export interface DependencyStatus {
  name: string;
  description: string;
  type: DependencyType;
  healthy: boolean;
  healthCode: number;
  latencyMs: number;
  lastChecked: string;
  impact?: string;
  errorMessage?: string;
  error?: unknown;
  checkDetails?: Record<string, unknown>;
}

export interface ServiceHealth {
  name: string;
  tier: ServiceTier;
  healthy: boolean;
  failureState: FailureState | null;
  dependencies: DependencyStatus[];
  timestamp: string;
}

export interface DependencyConfig {
  id: string;
  type: DependencyType;
}

export interface MockServiceConfig {
  id: string;
  name: string;
  tier: ServiceTier;
  dependencies: DependencyConfig[];
}

export type HealthCheckCallback = (serviceId: string, depType: DependencyType) => Promise<DependencyStatus>;
