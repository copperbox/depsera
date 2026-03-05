export type AlertChannelType = 'slack' | 'webhook';
export type AlertSeverityFilter = 'critical' | 'warning' | 'all';
export type AlertStatus = 'sent' | 'failed' | 'suppressed' | 'muted';

export interface SlackConfig {
  webhook_url: string;
}

export interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  method?: string;
}

export type AlertChannelConfig = SlackConfig | WebhookConfig;

export interface AlertChannel {
  id: string;
  team_id: string;
  channel_type: AlertChannelType;
  config: string; // JSON string
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface AlertRule {
  id: string;
  team_id: string;
  severity_filter: AlertSeverityFilter;
  is_active: number;
  use_custom_thresholds: number;
  cooldown_minutes: number | null;
  rate_limit_per_hour: number | null;
  alert_delay_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface AlertHistoryEntry {
  id: string;
  alert_channel_id: string;
  service_id: string;
  dependency_id: string | null;
  event_type: string;
  payload: string | null;
  sent_at: string;
  status: AlertStatus;
}

export interface CreateAlertChannelInput {
  channel_type: AlertChannelType;
  config: AlertChannelConfig;
}

export interface UpdateAlertChannelInput {
  channel_type?: AlertChannelType;
  config?: AlertChannelConfig;
  is_active?: boolean;
}

export interface TestAlertChannelResult {
  success: boolean;
  error: string | null;
}

export interface UpdateAlertRuleInput {
  severity_filter: AlertSeverityFilter;
  is_active?: boolean;
  use_custom_thresholds?: boolean;
  cooldown_minutes?: number | null;
  rate_limit_per_hour?: number | null;
  alert_delay_minutes?: number | null;
}

export interface AlertMute {
  id: string;
  team_id: string;
  dependency_id: string | null;
  canonical_name: string | null;
  service_id: string | null;
  reason: string | null;
  created_by: string;
  expires_at: string | null;
  created_at: string;
  // Joined fields
  dependency_name?: string;
  service_name?: string;
  created_by_name?: string;
}

export interface CreateAlertMuteInput {
  dependency_id?: string;
  canonical_name?: string;
  service_id?: string;
  duration?: string; // e.g. '30m', '2h', '1d'
  reason?: string;
}

export interface AlertMuteListResponse {
  mutes: AlertMute[];
  total: number;
  limit: number;
  offset: number;
}

export interface AlertHistoryListOptions {
  limit?: number;
  offset?: number;
  status?: AlertStatus;
}

export interface AlertHistoryResponse {
  entries: AlertHistoryEntry[];
  limit: number;
  offset: number;
}
