// Health state values: 0=OK, 1=WARNING, 2=CRITICAL
export type HealthState = 0 | 1 | 2;
export type HealthStatus =
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'unknown';

export interface Team {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamWithCounts extends Team {
  member_count: number;
  service_count: number;
}

// Aggregated health based on what dependents report about this service
export interface ServiceHealth {
  status: HealthStatus;
  healthy_reports: number;
  warning_reports: number;
  critical_reports: number;
  total_reports: number;
  dependent_count: number;
  last_report: string | null;
}

// Report from a service that depends on another service
export interface DependentReport {
  dependency_id: string;
  dependency_name: string;
  reporting_service_id: string;
  reporting_service_name: string;
  healthy: number | null;
  health_state: HealthState | null;
  latency_ms: number | null;
  last_checked: string | null;
  impact: string | null;
}

export interface Service {
  id: string;
  name: string;
  team_id: string;
  health_endpoint: string;
  metrics_endpoint: string | null;
  is_active: number;
  last_poll_success: number | null;
  last_poll_error: string | null;
  created_at: string;
  updated_at: string;
  team: Team;
  health: ServiceHealth;
}

export interface Dependency {
  id: string;
  service_id: string;
  name: string;
  description: string | null;
  impact: string | null;
  healthy: number | null;
  health_state: HealthState | null;
  health_code: number | null;
  latency_ms: number | null;
  last_checked: string | null;
  last_status_change: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceWithDependencies extends Service {
  dependencies: Dependency[];
  dependent_reports: DependentReport[];
}

export interface CreateServiceInput {
  name: string;
  team_id: string;
  health_endpoint: string;
  metrics_endpoint?: string;
}

export interface UpdateServiceInput {
  name?: string;
  team_id?: string;
  health_endpoint?: string;
  metrics_endpoint?: string;
  is_active?: boolean;
}
