import { ValidationError } from '../../utils/errors';
import { AlertChannelType, AlertSeverityFilter } from '../../db/types';

const VALID_CHANNEL_TYPES: AlertChannelType[] = ['slack', 'webhook'];
const VALID_SEVERITY_FILTERS: AlertSeverityFilter[] = ['critical', 'warning', 'all'];

const SLACK_WEBHOOK_PATTERN = /^https:\/\/hooks\.slack\.com\/services\/.+$/;

interface SlackConfig {
  webhook_url: string;
}

interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  method?: string;
}

const VALID_WEBHOOK_METHODS = ['POST', 'PUT', 'PATCH'];

export interface ValidatedChannelCreate {
  channel_type: AlertChannelType;
  config: string;
}

export interface ValidatedChannelUpdate {
  channel_type?: AlertChannelType;
  config?: string;
  is_active?: boolean;
}

export interface ValidatedRulesUpdate {
  severity_filter: AlertSeverityFilter;
  is_active: boolean;
}

/**
 * Validate channel creation input.
 */
export function validateChannelCreate(body: Record<string, unknown>): ValidatedChannelCreate {
  const { channel_type, config } = body;

  if (!channel_type || typeof channel_type !== 'string') {
    throw new ValidationError('channel_type is required', 'channel_type');
  }

  if (!VALID_CHANNEL_TYPES.includes(channel_type as AlertChannelType)) {
    throw new ValidationError(`channel_type must be one of: ${VALID_CHANNEL_TYPES.join(', ')}`, 'channel_type');
  }

  if (!config || typeof config !== 'object') {
    throw new ValidationError('config is required and must be an object', 'config');
  }

  const validatedConfig = validateChannelConfig(channel_type as AlertChannelType, config as Record<string, unknown>);

  return {
    channel_type: channel_type as AlertChannelType,
    config: JSON.stringify(validatedConfig),
  };
}

/**
 * Validate channel update input.
 */
export function validateChannelUpdate(body: Record<string, unknown>): ValidatedChannelUpdate {
  const result: ValidatedChannelUpdate = {};

  if (body.channel_type !== undefined) {
    if (typeof body.channel_type !== 'string' || !VALID_CHANNEL_TYPES.includes(body.channel_type as AlertChannelType)) {
      throw new ValidationError(`channel_type must be one of: ${VALID_CHANNEL_TYPES.join(', ')}`, 'channel_type');
    }
    result.channel_type = body.channel_type as AlertChannelType;
  }

  if (body.config !== undefined) {
    if (!body.config || typeof body.config !== 'object') {
      throw new ValidationError('config must be an object', 'config');
    }

    // If channel_type is being updated, validate against the new type
    // Otherwise we need the existing channel_type — caller handles this
    const channelType = result.channel_type;
    if (channelType) {
      const validatedConfig = validateChannelConfig(channelType, body.config as Record<string, unknown>);
      result.config = JSON.stringify(validatedConfig);
    } else {
      // Config is being updated without changing channel_type — defer validation to caller
      result.config = JSON.stringify(body.config);
    }
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') {
      throw new ValidationError('is_active must be a boolean', 'is_active');
    }
    result.is_active = body.is_active;
  }

  if (Object.keys(result).length === 0) {
    throw new ValidationError('At least one field must be provided for update');
  }

  return result;
}

/**
 * Validate alert rules update input.
 */
export function validateRulesUpdate(body: Record<string, unknown>): ValidatedRulesUpdate {
  const { severity_filter, is_active } = body;

  if (!severity_filter || typeof severity_filter !== 'string') {
    throw new ValidationError('severity_filter is required', 'severity_filter');
  }

  if (!VALID_SEVERITY_FILTERS.includes(severity_filter as AlertSeverityFilter)) {
    throw new ValidationError(`severity_filter must be one of: ${VALID_SEVERITY_FILTERS.join(', ')}`, 'severity_filter');
  }

  return {
    severity_filter: severity_filter as AlertSeverityFilter,
    is_active: is_active !== undefined ? Boolean(is_active) : true,
  };
}

/**
 * Validate channel config based on channel type.
 */
function validateChannelConfig(channelType: AlertChannelType, config: Record<string, unknown>): SlackConfig | WebhookConfig {
  switch (channelType) {
    case 'slack':
      return validateSlackConfig(config);
    case 'webhook':
      return validateWebhookConfig(config);
    default:
      throw new ValidationError(`Unsupported channel type: ${channelType}`, 'channel_type');
  }
}

function validateSlackConfig(config: Record<string, unknown>): SlackConfig {
  const { webhook_url } = config;

  if (!webhook_url || typeof webhook_url !== 'string') {
    throw new ValidationError('config.webhook_url is required for Slack channels', 'config.webhook_url');
  }

  if (!SLACK_WEBHOOK_PATTERN.test(webhook_url)) {
    throw new ValidationError('config.webhook_url must be a valid Slack webhook URL (https://hooks.slack.com/services/...)', 'config.webhook_url');
  }

  return { webhook_url };
}

function validateWebhookConfig(config: Record<string, unknown>): WebhookConfig {
  const { url, headers, method } = config;

  if (!url || typeof url !== 'string') {
    throw new ValidationError('config.url is required for webhook channels', 'config.url');
  }

  try {
    new URL(url);
  } catch {
    throw new ValidationError('config.url must be a valid URL', 'config.url');
  }

  const result: WebhookConfig = { url };

  if (headers !== undefined) {
    if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) {
      throw new ValidationError('config.headers must be an object', 'config.headers');
    }

    // Ensure all header values are strings
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== 'string') {
        throw new ValidationError(`config.headers.${key} must be a string`, `config.headers.${key}`);
      }
    }

    result.headers = headers as Record<string, string>;
  }

  if (method !== undefined) {
    if (typeof method !== 'string') {
      throw new ValidationError('config.method must be a string', 'config.method');
    }
    const upper = method.toUpperCase();
    if (!VALID_WEBHOOK_METHODS.includes(upper)) {
      throw new ValidationError(`config.method must be one of: ${VALID_WEBHOOK_METHODS.join(', ')}`, 'config.method');
    }
    result.method = upper;
  }

  return result;
}
