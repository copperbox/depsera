import pinoHttp from 'pino-http';
import type { Request } from 'express';
import type { Logger } from 'pino';

const REDACTED_HEADERS: ReadonlySet<string> = new Set([
  'authorization',
  'cookie',
  'x-csrf-token',
  'set-cookie',
]);

export interface RequestLoggerOptions {
  logger: Logger;
  quietHealthCheck?: boolean;
}

export function createRequestLogger(options: RequestLoggerOptions) {
  const { logger, quietHealthCheck = true } = options;

  return pinoHttp({
    logger,

    autoLogging: {
      ignore: quietHealthCheck
        ? (req) => (req as Request).originalUrl === '/api/health'
        : undefined,
    },

    customProps: (req) => {
      const expressReq = req as Request;
      const userId = expressReq.session?.userId;
      return userId ? { userId } : {};
    },

    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        headers: redactHeaders(req.headers),
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  });
}

function redactHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string | string[] | undefined> {
  const redacted: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (REDACTED_HEADERS.has(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else if (value !== undefined) {
      redacted[key] = value;
    }
  }
  return redacted;
}

export { redactHeaders };
