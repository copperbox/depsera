import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase, closeDatabase } from './db';
import { sessionMiddleware, warnInsecureCookies, initializeOIDC, requireAuth, validateLocalAuthConfig, bootstrapLocalAdmin, getAuthMode } from './auth';
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
import adminRouter from './routes/admin';
import alertsRouter from './routes/alerts';
import dependenciesRouter from './routes/dependencies';
import { HealthPollingService, PollingEventType, StatusChangeEvent } from './services/polling';
import { SettingsService } from './services/settings/SettingsService';
import { DataRetentionService } from './services/retention/DataRetentionService';
import { AlertService } from './services/alerts';
import { SlackSender } from './services/alerts/senders/SlackSender';
import { WebhookSender } from './services/alerts/senders/WebhookSender';
import { getStores } from './stores';
import { errorHandler } from './utils/errors';
import { clientBuildExists, createStaticMiddleware } from './middleware/staticFiles';
import { csrfProtection } from './middleware/csrf';
import { createSecurityHeaders } from './middleware/securityHeaders';
import { parseTrustProxy } from './middleware/trustProxy';
import { createHttpsRedirect } from './middleware/httpsRedirect';
import { createGlobalRateLimit, createAuthRateLimit } from './middleware/rateLimit';
import { createRequestLogger } from './middleware/requestLogger';
import logger from './utils/logger';

dotenv.config();

// Validate auth mode configuration early
validateLocalAuthConfig();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (must be set before any middleware that reads req.secure / req.ip)
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

// Middleware
app.use(createSecurityHeaders());
app.use(createHttpsRedirect());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(createGlobalRateLimit());
app.use(sessionMiddleware);

// HTTP request logging (after session so userId is available in log entries)
app.use(createRequestLogger({ logger }));

// CSRF protection (must come after session middleware)
app.use('/api', csrfProtection);

// Public routes
app.use('/api/auth', createAuthRateLimit(), authRouter);
app.use('/api/health', healthRouter);

// Protected routes
app.use('/api/services', requireAuth, servicesRouter);
app.use('/api/teams', requireAuth, teamsRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/graph', requireAuth, graphRouter);
app.use('/api/latency', requireAuth, latencyRouter);
app.use('/api/errors', requireAuth, errorsRouter);
app.use('/api/aliases', requireAuth, aliasesRouter);
app.use('/api/dependencies', requireAuth, dependenciesRouter);
app.use('/api', requireAuth, associationsRouter);
app.use('/api/admin', requireAuth, adminRouter);
app.use('/api/teams', requireAuth, alertsRouter);

// Global error handler — catches body-parser errors, unhandled route errors, etc.
// Must be registered after all routes (Express identifies error handlers by 4-param signature).
app.use(errorHandler);

// Serve built client in production (auto-detected by presence of client/dist/index.html)
if (clientBuildExists()) {
  logger.info('serving client build from client/dist/');
  app.use(createStaticMiddleware());
}

// Initialize and start server
async function start() {
  initializeDatabase();

  const authMode = getAuthMode();
  logger.info({ authMode }, 'auth mode');

  // Initialize OIDC client only in OIDC mode
  if (authMode === 'oidc') {
    try {
      await initializeOIDC();
    } catch (error) {
      logger.fatal({ err: error }, 'failed to initialize OIDC — set LOCAL_AUTH=true for development without OIDC');
      process.exit(1);
    }
  }

  // Bootstrap local admin if needed
  if (authMode === 'local') {
    bootstrapLocalAdmin();
  }

  // Initialize settings service (auto-loads DB values into cache on first access)
  SettingsService.getInstance(getStores().settings);

  // Initialize health polling service
  const pollingService = HealthPollingService.getInstance();

  // Log status changes (for debugging and future alerting)
  pollingService.on(PollingEventType.STATUS_CHANGE, (event: StatusChangeEvent) => {
    logger.info({ service: event.serviceName, dependency: event.dependencyName, from: event.previousHealthy, to: event.currentHealthy }, 'dependency status changed');
  });

  pollingService.on(PollingEventType.POLL_ERROR, (event: { serviceId: string; serviceName: string; error: string }) => {
    logger.error({ service: event.serviceName, error: event.error }, 'poll failed');
  });

  // Warn about insecure session cookie settings
  warnInsecureCookies();

  // Warn about HTTPS redirect without proxy trust
  if (process.env.REQUIRE_HTTPS === 'true' && !process.env.TRUST_PROXY) {
    logger.warn('REQUIRE_HTTPS is enabled but TRUST_PROXY is not set — HTTPS redirect will not work correctly behind a reverse proxy');
  }

  // Log SSRF allowlist configuration
  if (process.env.SSRF_ALLOWLIST) {
    logger.info({ allowlist: process.env.SSRF_ALLOWLIST }, 'SSRF allowlist configured');
  }

  // Initialize alert service (subscribe to polling events)
  const alertService = AlertService.getInstance();
  alertService.registerSender('slack', new SlackSender());
  alertService.registerSender('webhook', new WebhookSender());
  alertService.start(pollingService);

  // Start data retention scheduler
  const retentionService = DataRetentionService.getInstance();
  retentionService.start();

  // Start polling all active services
  pollingService.startAll();

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'server started');
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('shutting down');

    // Stop alert service (removes event listeners, flushes retries)
    alertService.shutdown();

    // Stop data retention scheduler
    retentionService.stop();

    await pollingService.shutdown();

    // Close database connection
    closeDatabase();

    server.close(() => {
      logger.info('server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds if server doesn't close gracefully
    // Use unref() so this timer doesn't keep the process alive
    const forceExitTimer = setTimeout(() => {
      logger.warn('forcing exit after timeout');
      process.exit(0);
    }, 10000);
    forceExitTimer.unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((error) => {
  logger.fatal({ err: error }, 'failed to start server');
  process.exit(1);
});

export default app;
