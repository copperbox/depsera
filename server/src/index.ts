import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase, closeDatabase } from './db';
import { sessionMiddleware, initializeBypassMode, bypassAuthMiddleware, initializeOIDC, requireAuth } from './auth';
import authRouter from './routes/auth';
import healthRouter from './routes/health';
import servicesRouter from './routes/services';
import teamsRouter from './routes/teams';
import usersRouter from './routes/users';
import associationsRouter from './routes/associations';
import graphRouter from './routes/graph';
import latencyRouter from './routes/latency';
import errorsRouter from './routes/errors';
import aliasesRouter from './routes/aliases';
import { HealthPollingService, PollingEventType, StatusChangeEvent } from './services/polling';
import { clientBuildExists, createStaticMiddleware } from './middleware/staticFiles';
import { csrfProtection } from './middleware/csrf';

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

// CSRF protection (must come after session middleware)
app.use('/api', csrfProtection);

// Public routes
app.use('/api/auth', authRouter);
app.use('/api/health', healthRouter);

// Protected routes
app.use('/api/services', requireAuth, servicesRouter);
app.use('/api/teams', requireAuth, teamsRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/graph', requireAuth, graphRouter);
app.use('/api/latency', requireAuth, latencyRouter);
app.use('/api/errors', requireAuth, errorsRouter);
app.use('/api/aliases', requireAuth, aliasesRouter);
app.use('/api', requireAuth, associationsRouter);

// Serve built client in production (auto-detected by presence of client/dist/index.html)
if (clientBuildExists()) {
  console.log('[Static] Serving client build from client/dist/');
  app.use(createStaticMiddleware());
}

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

  // Initialize health polling service
  const pollingService = HealthPollingService.getInstance();

  // Log status changes (for debugging and future alerting)
  pollingService.on(PollingEventType.STATUS_CHANGE, (event: StatusChangeEvent) => {
    console.log(`[Health] ${event.serviceName}/${event.dependencyName}: ${event.previousHealthy} -> ${event.currentHealthy}`);
  });

  pollingService.on(PollingEventType.POLL_ERROR, (event: { serviceId: string; serviceName: string; error: string }) => {
    console.error(`[Health] Poll failed for ${event.serviceName}: ${event.error}`);
  });

  // Log SSRF allowlist configuration
  if (process.env.SSRF_ALLOWLIST) {
    console.log(`[Security] SSRF allowlist: ${process.env.SSRF_ALLOWLIST}`);
  }

  // Start polling all active services
  pollingService.startAll();

  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');

    // Remove event listeners to allow garbage collection
    pollingService.removeAllListeners();

    await pollingService.shutdown();

    // Close database connection
    closeDatabase();

    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds if server doesn't close gracefully
    // Use unref() so this timer doesn't keep the process alive
    const forceExitTimer = setTimeout(() => {
      console.log('Forcing exit...');
      process.exit(0);
    }, 10000);
    forceExitTimer.unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;
