import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './db';
import { sessionMiddleware, initializeBypassMode, bypassAuthMiddleware, initializeOIDC, requireAuth } from './auth';
import authRouter from './routes/auth';
import healthRouter from './routes/health';
import servicesRouter from './routes/services';
import teamsRouter from './routes/teams';
import usersRouter from './routes/users';

dotenv.config();

// Validate bypass mode configuration early
initializeBypassMode();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(sessionMiddleware);

// Dev bypass middleware (auto-authenticates in dev mode when AUTH_BYPASS=true)
app.use(bypassAuthMiddleware);

// Public routes
app.use('/api/auth', authRouter);
app.use('/api/health', healthRouter);

// Protected routes
app.use('/api/services', requireAuth, servicesRouter);
app.use('/api/teams', requireAuth, teamsRouter);
app.use('/api/users', requireAuth, usersRouter);

// Initialize and start server
async function start() {
  initializeDatabase();

  // Initialize OIDC client unless in bypass mode
  if (process.env.AUTH_BYPASS !== 'true') {
    try {
      await initializeOIDC();
    } catch (error) {
      console.error('Failed to initialize OIDC:', error);
      console.error('Set AUTH_BYPASS=true for local development without OIDC');
      process.exit(1);
    }
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;
