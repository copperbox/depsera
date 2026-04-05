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
  rate_limit_rpm: number;
  rate_limit_is_custom: boolean;
  rate_limit_admin_locked: boolean;
  usage_1h: number;
  usage_24h: number;
  usage_7d: number;
  rejected_24h: number;
  rejected_7d: number;
}

export interface ApiKeyUsageBucket {
  bucket_start: string;
  push_count: number;
  rejected_count: number;
}

export interface ApiKeyUsageResponse {
  api_key_id: string;
  granularity: 'minute' | 'hour';
  from: string;
  to: string;
  buckets: ApiKeyUsageBucket[];
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
