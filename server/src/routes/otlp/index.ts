import { Router, Request, Response } from 'express';
import { getStores } from '../../stores';
import { OtlpParser, OtlpParseResult } from '../../services/polling/OtlpParser';
import { getDependencyUpsertService } from '../../services/polling/DependencyUpsertService';
import { HealthPollingService } from '../../services/polling';
import { Service } from '../../db/types';
import { StatusChangeEvent, PollingEventType } from '../../services/polling/types';
import logger from '../../utils/logger';

const router = Router();
const parser = new OtlpParser();

/**
 * POST /v1/metrics
 * OTLP JSON metrics receiver. Authenticated via API key (requireApiKeyAuth middleware).
 * Parses OTLP payload, auto-registers unknown services, and upserts dependencies.
 */
router.post('/', (req: Request, res: Response): void => {
  const teamId = req.apiKeyTeamId;

  if (!teamId) {
    res.status(401).json({ error: 'Missing team context' });
    return;
  }

  // Parse the OTLP payload
  let results: OtlpParseResult[];
  try {
    results = parser.parseRequest(req.body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid OTLP payload';
    logger.warn({ err }, 'OTLP parse error');
    res.status(400).json({
      partialSuccess: {
        rejectedDataPoints: -1,
        errorMessage: message,
      },
    });
    return;
  }

  const stores = getStores();
  const upsertService = getDependencyUpsertService();
  const warnings: string[] = [...parser.lastWarnings];
  let totalRejected = 0;
  const allChanges: StatusChangeEvent[] = [];

  for (const result of results) {
    try {
      // Find or auto-register the service
      const service = findOrCreateService(stores, teamId, result.serviceName, warnings);

      // Upsert dependencies
      const changes = upsertService.upsert(service, result.dependencies);
      allChanges.push(...changes);

      // Update poll result on the service
      stores.services.updatePollResult(service.id, true, undefined, warnings.length > 0 ? warnings : undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ err, serviceName: result.serviceName }, 'OTLP upsert failed for service');
      warnings.push(`Service "${result.serviceName}": ${message}`);
      totalRejected += result.dependencies.length;
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
 * Find a service by name + team, or auto-create it as an OTLP push service.
 */
function findOrCreateService(
  stores: ReturnType<typeof getStores>,
  teamId: string,
  serviceName: string,
  warnings: string[],
): Service {
  const teamServices = stores.services.findByTeamId(teamId);
  const existing = teamServices.find((s) => s.name === serviceName);

  if (existing) {
    if (existing.health_endpoint_format !== 'otlp') {
      warnings.push(
        `Service "${serviceName}" exists with format "${existing.health_endpoint_format}" — receiving OTLP data but not overwriting format`
      );
    }
    return existing;
  }

  // Auto-register new service
  const service = stores.services.create({
    name: serviceName,
    team_id: teamId,
    health_endpoint: '',
    health_endpoint_format: 'otlp',
    poll_interval_ms: 0,
  });

  logger.info({ serviceId: service.id, serviceName, teamId }, 'auto-registered OTLP service');

  return service;
}

export default router;
