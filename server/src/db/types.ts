// User types
export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  name: string;
  oidc_subject: string | null;
  password_hash: string | null;
  role: UserRole;
  is_active: number; // SQLite boolean
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  email: string;
  name: string;
  oidc_subject?: string;
  password_hash?: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
  role?: UserRole;
  is_active?: boolean;
}

// Team types
export type TeamMemberRole = 'lead' | 'member';

export interface Team {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTeamInput {
  name: string;
  description?: string;
}

export interface UpdateTeamInput {
  name?: string;
  description?: string;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  role: TeamMemberRole;
  created_at: string;
}

export interface TeamWithMembers extends Team {
  members: (TeamMember & { user: User })[];
}

// Schema mapping types (Custom Health Endpoint Schema)
export interface BooleanComparison {
  field: string;
  equals: string;
}

export type FieldMapping = string | BooleanComparison;

export interface SchemaMapping {
  root: string;
  fields: {
    name: FieldMapping;
    healthy: FieldMapping;
    latency?: FieldMapping;
    impact?: FieldMapping;
    description?: FieldMapping;
  };
}

// Service types
export interface Service {
  id: string;
  name: string;
  team_id: string;
  health_endpoint: string;
  metrics_endpoint: string | null;
  schema_config: string | null; // JSON string of SchemaMapping
  poll_interval_ms: number;
  is_active: number; // SQLite boolean
  is_external: number; // SQLite boolean
  description: string | null;
  last_poll_success: number | null; // SQLite boolean (0/1)
  last_poll_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateServiceInput {
  name: string;
  team_id: string;
  health_endpoint: string;
  metrics_endpoint?: string;
  schema_config?: string | null;
  poll_interval_ms?: number;
}

export interface UpdateServiceInput {
  name?: string;
  team_id?: string;
  health_endpoint?: string;
  metrics_endpoint?: string;
  schema_config?: string | null;
  poll_interval_ms?: number;
  is_active?: boolean;
}

export interface ServiceWithDependencies extends Service {
  dependencies: Dependency[];
  team: Team;
}

// Dependency types
export type HealthState = 0 | 1 | 2; // 0=OK, 1=WARNING, 2=CRITICAL

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

export const DEPENDENCY_TYPES: DependencyType[] = [
  'database',
  'rest',
  'soap',
  'grpc',
  'graphql',
  'message_queue',
  'cache',
  'file_system',
  'smtp',
  'other',
];

export interface Dependency {
  id: string;
  service_id: string;
  name: string;
  canonical_name: string | null;
  description: string | null;
  impact: string | null;
  type: DependencyType;
  healthy: number | null; // SQLite boolean
  health_state: HealthState | null;
  health_code: number | null;
  latency_ms: number | null;
  check_details: string | null; // JSON string of check details
  error: string | null; // JSON string of error object
  error_message: string | null;
  last_checked: string | null;
  last_status_change: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDependencyInput {
  service_id: string;
  name: string;
  description?: string;
  impact?: string;
  type?: DependencyType;
}

export interface UpdateDependencyInput {
  description?: string;
  impact?: string;
  type?: DependencyType;
  healthy?: boolean;
  health_state?: HealthState;
  health_code?: number;
  latency_ms?: number;
  last_checked?: string;
}

// Dependency Association types
export type AssociationType = 'api_call' | 'database' | 'message_queue' | 'cache' | 'other';

export interface DependencyAssociation {
  id: string;
  dependency_id: string;
  linked_service_id: string;
  association_type: AssociationType;
  is_auto_suggested: number; // SQLite boolean
  confidence_score: number | null;
  is_dismissed: number; // SQLite boolean
  created_at: string;
}

export interface CreateAssociationInput {
  dependency_id: string;
  linked_service_id: string;
  association_type: AssociationType;
  is_auto_suggested?: boolean;
  confidence_score?: number;
}

export interface DependencyWithAssociations extends Dependency {
  associations: (DependencyAssociation & { linked_service: Service })[];
}

// Dependency alias types
export interface DependencyAlias {
  id: string;
  alias: string;
  canonical_name: string;
  created_at: string;
}

// proactive-deps response format
export interface ProactiveDepsStatus {
  name: string;
  description?: string;
  impact?: string;
  type?: DependencyType;
  healthy: boolean;
  health: {
    state: HealthState;
    code: number;
    latency: number;
    skipped?: boolean;
  };
  lastChecked: string;
  checkDetails?: Record<string, unknown>;
  error?: unknown;
  errorMessage?: string;
}

// Aggregated health types (based on dependent reports)
export type AggregatedHealthStatus =
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'unknown';

export interface AggregatedHealth {
  status: AggregatedHealthStatus;
  healthy_reports: number;
  warning_reports: number;
  critical_reports: number;
  total_reports: number;
  dependent_count: number;
  last_report: string | null;
}

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

// Latency history types
export interface DependencyLatencyHistory {
  id: string;
  dependency_id: string;
  latency_ms: number;
  recorded_at: string;
}

export interface LatencyStats {
  avgLatencyMs24h: number | null;
  minLatencyMs24h: number | null;
  maxLatencyMs24h: number | null;
  dataPointCount: number;
}

export interface LatencyDataPoint {
  latency_ms: number;
  recorded_at: string;
}

// Error history types
export interface DependencyErrorHistory {
  id: string;
  dependency_id: string;
  error: string | null;
  error_message: string | null;
  recorded_at: string;
}

export interface ErrorHistoryResponse {
  dependencyId: string;
  errorCount: number;
  errors: {
    error: unknown;
    errorMessage: string | null;
    recordedAt: string;
    isRecovery: boolean;
  }[];
}

// Audit log types
export type AuditAction =
  | 'user.created'
  | 'user.role_changed'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'user.password_reset'
  | 'team.created'
  | 'team.updated'
  | 'team.deleted'
  | 'team.member_added'
  | 'team.member_removed'
  | 'team.member_role_changed'
  | 'service.created'
  | 'service.updated'
  | 'service.deleted'
  | 'external_service.created'
  | 'external_service.updated'
  | 'external_service.deleted'
  | 'settings.updated';

export type AuditResourceType = 'user' | 'team' | 'service' | 'external_service' | 'settings';

export interface AuditLogEntry {
  id: string;
  user_id: string;
  action: AuditAction;
  resource_type: AuditResourceType;
  resource_id: string | null;
  details: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogEntryWithUser extends AuditLogEntry {
  user_email: string;
  user_name: string;
}

// Alert types
export type AlertChannelType = 'slack' | 'webhook';
export type AlertSeverityFilter = 'critical' | 'warning' | 'all';
export type AlertStatus = 'sent' | 'failed' | 'suppressed';

export interface AlertChannel {
  id: string;
  team_id: string;
  channel_type: AlertChannelType;
  config: string; // JSON string
  is_active: number; // SQLite boolean
  created_at: string;
  updated_at: string;
}

export interface CreateAlertChannelInput {
  team_id: string;
  channel_type: AlertChannelType;
  config: string; // JSON string
}

export interface UpdateAlertChannelInput {
  channel_type?: AlertChannelType;
  config?: string;
  is_active?: boolean;
}

export interface AlertRule {
  id: string;
  team_id: string;
  severity_filter: AlertSeverityFilter;
  is_active: number; // SQLite boolean
  created_at: string;
  updated_at: string;
}

export interface CreateAlertRuleInput {
  team_id: string;
  severity_filter: AlertSeverityFilter;
}

export interface UpdateAlertRuleInput {
  severity_filter?: AlertSeverityFilter;
  is_active?: boolean;
}

export interface AlertHistoryEntry {
  id: string;
  alert_channel_id: string;
  service_id: string;
  dependency_id: string | null;
  event_type: string;
  payload: string | null; // JSON string
  sent_at: string;
  status: AlertStatus;
}

// Settings types
export interface Setting {
  key: string;
  value: string | null;
  updated_at: string;
  updated_by: string | null;
}
