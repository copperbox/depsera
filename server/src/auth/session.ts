import session from 'express-session';

// Extend session type for TypeScript
declare module 'express-session' {
  interface SessionData {
    userId: string;
    codeVerifier?: string;
    state?: string;
    returnTo?: string;
  }
}

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
  },
  name: 'deps-dashboard.sid',
});
