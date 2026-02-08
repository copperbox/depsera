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
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    },
    auth: {
      windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '60000', 10),
      max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10', 10),
    },
  };
}

export function createGlobalRateLimit(config?: Partial<RateLimitConfig>) {
  const defaults = parseRateLimitConfig().global;
  return rateLimit({
    windowMs: config?.windowMs ?? defaults.windowMs,
    max: config?.max ?? defaults.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  });
}

export function createAuthRateLimit(config?: Partial<RateLimitConfig>) {
  const defaults = parseRateLimitConfig().auth;
  return rateLimit({
    windowMs: config?.windowMs ?? defaults.windowMs,
    max: config?.max ?? defaults.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later' },
  });
}
