import helmet from 'helmet';

const isDev = process.env.NODE_ENV !== 'production';

export function createSecurityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: isDev ? ["'self'", "'unsafe-eval'"] : ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: isDev ? ["'self'", 'ws:'] : ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    frameguard: { action: 'deny' },
    crossOriginEmbedderPolicy: false,
    hsts: isDev ? false : { maxAge: 31536000, includeSubDomains: true },
  });
}
