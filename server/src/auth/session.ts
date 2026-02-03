import session from 'express-session';
import SqliteStore from 'better-sqlite3-session-store';
import { db } from '../db';

const BetterSqlite3Store = SqliteStore(session);

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
  store: new BetterSqlite3Store({
    client: db,
    expired: {
      clear: true,
      intervalMs: 15 * 60 * 1000, // Clean up expired sessions every 15 minutes
    },
  }),
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
