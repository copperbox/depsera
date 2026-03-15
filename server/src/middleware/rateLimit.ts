import rateLimit from 'express-rate-limit';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export function parseRateLimitConfig(): {
  global: RateLimitConfig;
  auth: RateLimitConfig;
} {
  return {
    global: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
      max: parseInt(process.env.RATE_LIMIT_MAX || '3000', 10),
    },
    auth: {
      windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '60000', 10),
      max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
    },
  };
}

export function createGlobalRateLimit(config?: Partial<RateLimitConfig>) {
  const defaults = parseRateLimitConfig().global;
  const isDev = process.env.NODE_ENV === 'development';
  return rateLimit({
    windowMs: config?.windowMs ?? defaults.windowMs,
    max: config?.max ?? defaults.max,
    skip: isDev ? () => true : undefined,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });
}

export function createAuthRateLimit(config?: Partial<RateLimitConfig>) {
  const defaults = parseRateLimitConfig().auth;
  const isDev = process.env.NODE_ENV === 'development';
  return rateLimit({
    windowMs: config?.windowMs ?? defaults.windowMs,
    max: config?.max ?? defaults.max,
    skip: isDev ? () => true : undefined,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later' },
  });
}

export function createOtlpRateLimit(config?: Partial<RateLimitConfig>) {
  const windowMs = config?.windowMs ?? parseInt(process.env.OTLP_RATE_LIMIT_WINDOW_MS || '60000', 10);
  const max = config?.max ?? parseInt(process.env.OTLP_RATE_LIMIT_MAX || '600', 10);
  const isDev = process.env.NODE_ENV === 'development';
  return rateLimit({
    windowMs,
    max,
    skip: isDev ? () => true : undefined,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests to OTLP endpoint, please try again later' },
  });
}
