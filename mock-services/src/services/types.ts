import { ServiceTier } from '../topology/types';
import { FailureState } from '../failures/types';

export interface DependencyStatus {
  name: string;
  description: string;
  healthy: boolean;
  healthCode: number;
  latencyMs: number;
  lastChecked: string;
  impact?: string;
  errorMessage?: string;
}

export interface ServiceHealth {
  name: string;
  tier: ServiceTier;
  healthy: boolean;
  failureState: FailureState | null;
  dependencies: DependencyStatus[];
  timestamp: string;
}

export interface MockServiceConfig {
  id: string;
  name: string;
  tier: ServiceTier;
  dependencyIds: string[];
}

export type HealthCheckCallback = (serviceId: string) => Promise<DependencyStatus>;
