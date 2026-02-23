import type { HealthStatus } from './service';

export interface WallboardReporter {
  dependency_id: string;
  service_id: string;
  service_name: string;
  service_team_id: string;
  service_team_name: string;
  healthy: number | null;
  health_state: number | null;
  latency_ms: number | null;
  last_checked: string | null;
}

export interface WallboardDependency {
  canonical_name: string;
  primary_dependency_id: string;
  health_status: HealthStatus;
  type: string;
  latency: { min: number; avg: number; max: number } | null;
  last_checked: string | null;
  error_message: string | null;
  impact: string | null;
  description: string | null;
  linked_service: { id: string; name: string } | null;
  reporters: WallboardReporter[];
  team_ids: string[];
}

export interface WallboardResponse {
  dependencies: WallboardDependency[];
  teams: { id: string; name: string }[];
}
