import { AlertChannel } from '../../../db/types';

const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

interface SlackConfig {
  webhook_url: string;
}

interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  method?: string;
}

function maskSlackConfig(config: SlackConfig): SlackConfig {
  const url = config.webhook_url;
  // Keep "https://hooks.slack.com/services/" + first path segment, mask the rest
  const servicesPrefix = 'https://hooks.slack.com/services/';
  if (url.startsWith(servicesPrefix)) {
    const afterPrefix = url.slice(servicesPrefix.length);
    const firstSlash = afterPrefix.indexOf('/');
    const firstSegment = firstSlash >= 0 ? afterPrefix.slice(0, firstSlash) : afterPrefix;
    return { webhook_url: `${servicesPrefix}${firstSegment}/${MASK}` };
  }
  // Fallback: mask everything after scheme
  return { webhook_url: `${url.slice(0, 8)}${MASK}` };
}

function maskWebhookConfig(config: WebhookConfig): WebhookConfig {
  const url = config.url;
  // Keep scheme + first 8 chars of host, mask rest
  let masked: string;
  try {
    const parsed = new URL(url);
    const hostPart = parsed.host.slice(0, 8);
    masked = `${parsed.protocol}//${hostPart}${MASK}`;
  } catch {
    masked = `${url.slice(0, 8)}${MASK}`;
  }

  const result: WebhookConfig = { url: masked };

  if (config.headers) {
    const maskedHeaders: Record<string, string> = {};
    for (const key of Object.keys(config.headers)) {
      maskedHeaders[key] = MASK;
    }
    result.headers = maskedHeaders;
  }

  if (config.method) {
    result.method = config.method;
  }

  return result;
}

/**
 * Returns a copy of the AlertChannel with sensitive config values masked.
 */
export function maskConfig(channel: AlertChannel): AlertChannel {
  let config: SlackConfig | WebhookConfig;
  try {
    config = JSON.parse(channel.config);
  } catch {
    return channel;
  }

  let masked: SlackConfig | WebhookConfig;
  if (channel.channel_type === 'slack') {
    masked = maskSlackConfig(config as SlackConfig);
  } else {
    masked = maskWebhookConfig(config as WebhookConfig);
  }

  return { ...channel, config: JSON.stringify(masked) };
}
