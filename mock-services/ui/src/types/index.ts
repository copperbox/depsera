export type ServiceTier = 'frontend' | 'api' | 'backend' | 'database';
export type FailureMode = 'outage' | 'high_latency' | 'error' | 'intermittent';
export type HealthStatus = 'healthy' | 'unhealthy';

export interface FailureConfig {
  latencyMs?: number;
  errorRate?: number;
  errorCode?: number;
}

export interface FailureState {
  mode: FailureMode;
  config: FailureConfig;
  isCascaded: boolean;
}

export interface ServiceHealth {
  healthy: boolean;
  timestamp: string;
}

export interface Service {
  id: string;
  name: string;
  tier: ServiceTier;
  health: ServiceHealth;
  failureState: FailureState | null;
}

export interface ServiceDependency {
  serviceId: string;
  type: string;
}

export interface TopologyService {
  id: string;
  name: string;
  tier: ServiceTier;
  port: number;
  dependencies: ServiceDependency[];
}

export interface Topology {
  services: TopologyService[];
}

export interface Scenario {
  name: string;
  description: string;
}

export interface ActiveFailure {
  serviceId: string;
  serviceName: string;
  state: FailureState;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
