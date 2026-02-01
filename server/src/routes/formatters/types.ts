import { AggregatedHealth, Team, Service, Dependency, DependentReport } from '../../db/types';

// Formatted team embedded in service response
export interface FormattedTeam {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// Health status for local dependencies (what a service depends on)
export interface LocalHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  healthy_count: number;
  unhealthy_count: number;
  total_dependencies: number;
}

// Formatted service response for list endpoints
export interface FormattedServiceListItem {
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
  team: FormattedTeam;
  health: AggregatedHealth;
}

// Formatted service response for detail endpoint
export interface FormattedServiceDetail extends FormattedServiceListItem {
  dependencies: Dependency[];
  dependent_reports: DependentReport[];
}

// Formatted service response for create/update endpoints
export interface FormattedServiceMutation {
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
  team: Team | FormattedTeam;
  dependencies: Dependency[];
  health: LocalHealthStatus;
}

// Formatted team member
export interface FormattedTeamMember {
  team_id: string;
  user_id: string;
  role: string;
  created_at: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

// Formatted team response for detail endpoint
export interface FormattedTeamDetail extends Team {
  members: FormattedTeamMember[];
  services: Service[];
}

// Formatted team response for list endpoint
export interface FormattedTeamListItem extends Team {
  member_count: number;
  service_count: number;
}
