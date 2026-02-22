export type AlertChannelType = 'slack' | 'webhook';
export type AlertSeverityFilter = 'critical' | 'warning' | 'all';
export type AlertStatus = 'sent' | 'failed' | 'suppressed';

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
