import { Database } from 'better-sqlite3';
import {
  Service,
  Team,
  User,
  Dependency,
  DependencyAssociation,
  DependencyType,
  AssociationType,
  TeamMemberRole,
  HealthState,
} from '../db/types';

// Database context for dependency injection
export type DatabaseContext = Database;

// Common list options for queries with filtering/pagination
export interface ListOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

// Service-specific filter options
export interface ServiceListOptions extends ListOptions {
  teamId?: string;
  isActive?: boolean;
}

// Dependency-specific filter options
export interface DependencyListOptions extends ListOptions {
  serviceId?: string;
  healthy?: boolean;
  type?: DependencyType;
}

// Association-specific filter options
export interface AssociationListOptions extends ListOptions {
  dependencyId?: string;
  linkedServiceId?: string;
  isAutoSuggested?: boolean;
  isDismissed?: boolean;
}

// Team member filter options
export interface TeamMemberListOptions extends ListOptions {
  role?: TeamMemberRole;
}

// View types - joined/computed data from queries

/**
 * Service with team info joined
 */
export interface ServiceWithTeam extends Service {
  team_name: string;
  team_description?: string | null;
  team_created_at?: string;
  team_updated_at?: string;
}

/**
 * Dependency with target service info from associations and avg latency
 */
export interface DependencyWithTarget extends Dependency {
  service_name: string;
  target_service_id: string | null;
  association_type: AssociationType | null;
  is_auto_suggested: number | null;
  confidence_score: number | null;
  avg_latency_24h: number | null;
}

/**
 * Association with linked service details
 */
export interface AssociationWithService extends DependencyAssociation {
  linked_service_name: string;
  linked_service_health_endpoint?: string;
}

/**
 * Association with full context (dependency + both services)
 */
export interface AssociationWithContext extends DependencyAssociation {
  dependency_name: string;
  service_name: string;
  linked_service_name: string;
}

/**
 * Report from a dependent service about this service's health
 */
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

/**
 * Latency statistics for a dependency
 */
export interface LatencyStats {
  avgLatencyMs24h: number | null;
  minLatencyMs24h: number | null;
  maxLatencyMs24h: number | null;
  dataPointCount: number;
}

/**
 * Error history entry with parsed data
 */
export interface ErrorHistoryEntry {
  id: string;
  dependency_id: string;
  error: string | null;
  error_message: string | null;
  recorded_at: string;
}

// Input types for store operations

export interface ServiceCreateInput {
  name: string;
  team_id: string;
  health_endpoint: string;
  metrics_endpoint?: string | null;
}

export interface ServiceUpdateInput {
  name?: string;
  team_id?: string;
  health_endpoint?: string;
  metrics_endpoint?: string | null;
  is_active?: boolean;
}

export interface TeamCreateInput {
  name: string;
  description?: string | null;
}

export interface TeamUpdateInput {
  name?: string;
  description?: string | null;
}

export interface UserCreateInput {
  email: string;
  name: string;
  oidc_subject?: string | null;
  role?: 'admin' | 'user';
}

export interface UserUpdateInput {
  email?: string;
  name?: string;
  role?: 'admin' | 'user';
  is_active?: boolean;
}

export interface DependencyUpsertInput {
  service_id: string;
  name: string;
  description?: string | null;
  impact?: string | null;
  type?: DependencyType;
  healthy: boolean;
  health_state: HealthState;
  health_code: number;
  latency_ms: number;
  check_details?: unknown;
  error?: unknown;
  error_message?: string | null;
  last_checked: string;
}

export interface AssociationCreateInput {
  dependency_id: string;
  linked_service_id: string;
  association_type: AssociationType;
  is_auto_suggested?: boolean;
  confidence_score?: number | null;
}
