export interface OtlpServiceStats {
  id: string;
  name: string;
  is_active: number;
  last_push_success: number | null;
  last_push_error: string | null;
  last_push_warnings: string[] | null;
  last_push_at: string | null;
  dependency_count: number;
  errors_24h: number;
  schema_config: string | null;
}

export interface OtlpApiKeyStats {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export interface OtlpStatsSummary {
  total_otlp_services: number;
  active_services: number;
  services_with_errors: number;
  services_never_pushed: number;
}

export interface OtlpStatsResponse {
  services: OtlpServiceStats[];
  apiKeys: OtlpApiKeyStats[];
  summary: OtlpStatsSummary;
}

export interface AdminOtlpTeamStats {
  team_id: string;
  team_name: string;
  services: OtlpServiceStats[];
  apiKeys: OtlpApiKeyStats[];
}

export interface AdminOtlpStatsSummary extends OtlpStatsSummary {
  total_teams: number;
}

export interface AdminOtlpStatsResponse {
  teams: AdminOtlpTeamStats[];
  summary: AdminOtlpStatsSummary;
}
