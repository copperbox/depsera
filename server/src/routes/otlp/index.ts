import { Router, Request, Response } from 'express';
import { getStores } from '../../stores';
import { OtlpParser } from '../../services/polling/OtlpParser';
import { getDependencyUpsertService } from '../../services/polling/DependencyUpsertService';
import { HealthPollingService } from '../../services/polling';
import { Service, MetricSchemaConfig } from '../../db/types';
import { isMetricSchemaConfig } from '../../services/polling/metricSchemaUtils';
import { StatusChangeEvent, PollingEventType } from '../../services/polling/types';
import { OtlpExportMetricsServiceRequest } from '../../services/polling/otlp-types';
import { findOrCreateService } from '../../services/polling/otlpServiceResolver';
import logger from '../../utils/logger';

const router = Router();
const parser = new OtlpParser();

/**
 * POST /v1/metrics
 * OTLP JSON metrics receiver. Authenticated via API key (requireApiKeyAuth middleware).
 * Parses OTLP payload per-service with config-aware metric mapping.
 */
router.post('/', (req: Request, res: Response): void => {
  const teamId = req.apiKeyTeamId;

  if (!teamId) {
    res.status(401).json({ error: 'Missing team context' });
    return;
  }

  // Validate basic OTLP structure
  const data = req.body;
  if (!data || typeof data !== 'object' || !Array.isArray(data.resourceMetrics)) {
    logger.warn('OTLP parse error: invalid payload structure');
    res.status(400).json({
      partialSuccess: {
        rejectedDataPoints: -1,
        errorMessage: 'Invalid OTLP payload: expected object with resourceMetrics array',
      },
    });
    return;
  }

  const request = data as OtlpExportMetricsServiceRequest;
  const stores = getStores();
  const upsertService = getDependencyUpsertService();
  const warnings: string[] = [];
  let totalRejected = 0;
  const allChanges: StatusChangeEvent[] = [];

  // Process each resourceMetrics entry with per-service config
  for (const rm of request.resourceMetrics) {
    try {
      const serviceName = parser.extractServiceName(rm);
      if (!serviceName) {
        warnings.push('Skipping resourceMetrics entry: missing service.name resource attribute');
        continue;
      }

      // Find or auto-register the service
      const service = findOrCreateService(stores, teamId, serviceName, warnings);

      // Load per-service metric schema config
      const metricConfig = loadMetricConfig(service);

      // Parse this resourceMetrics with the service's config
      const result = parser.parseResourceMetrics(rm, metricConfig);
      warnings.push(...parser.lastWarnings);

      // Upsert dependencies
      const changes = upsertService.upsert(service, result.dependencies);
      allChanges.push(...changes);

      // Update poll result on the service
      stores.services.updatePollResult(service.id, true, undefined, warnings.length > 0 ? warnings : undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ err }, 'OTLP processing failed for resourceMetrics entry');
      warnings.push(message);
      totalRejected++;
    }
  }

  // Emit status change events to the polling service for alert processing
  if (allChanges.length > 0) {
    try {
      const pollingService = HealthPollingService.getInstance();
      for (const change of allChanges) {
        pollingService.emit(PollingEventType.STATUS_CHANGE, change);
      }
    } catch {
      // Polling service may not be initialized in tests — non-critical
    }
  }

  res.status(200).json({
    partialSuccess: {
      rejectedDataPoints: totalRejected,
      errorMessage: warnings.length > 0 ? warnings.join('; ') : '',
    },
  });
});

/**
 * Load a MetricSchemaConfig from a service's schema_config if present and valid.
 */
function loadMetricConfig(service: Service): MetricSchemaConfig | undefined {
  if (!service.schema_config) return undefined;
  try {
    const parsed = JSON.parse(service.schema_config);
    return isMetricSchemaConfig(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export default router;
