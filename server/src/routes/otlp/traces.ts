import { Router, Request, Response } from 'express';
import { getStores } from '../../stores';
import { TraceParser } from '../../services/polling/TraceParser';
import { TraceDependencyBridge } from '../../services/polling/TraceDependencyBridge';
import { getDependencyUpsertService } from '../../services/polling/DependencyUpsertService';
import { findOrCreateService } from '../../services/polling/otlpServiceResolver';
import { HealthPollingService } from '../../services/polling';
import { StatusChangeEvent, PollingEventType } from '../../services/polling/types';
import { CreateSpanInput } from '../../db/types';
import { OtlpResourceSpans } from '../../services/polling/otlp-types';
import logger from '../../utils/logger';

const router = Router();
const traceParser = new TraceParser();
const bridge = new TraceDependencyBridge();

/**
 * POST /v1/traces
 * OTLP JSON trace receiver. Authenticated via API key (requireApiKeyAuth middleware).
 * Stores ALL spans and extracts CLIENT/PRODUCER dependencies for discovery.
 */
router.post('/', (req: Request, res: Response): void => {
  const teamId = req.apiKeyTeamId;

  if (!teamId) {
    res.status(401).json({ error: 'Missing team context' });
    return;
  }

  // Validate basic OTLP structure
  const data = req.body;
  if (!data || typeof data !== 'object' || !Array.isArray(data.resourceSpans)) {
    logger.warn('OTLP trace parse error: invalid payload structure');
    res.status(400).json({
      partialSuccess: {
        rejectedDataPoints: -1,
        errorMessage: 'Invalid OTLP payload: expected object with resourceSpans array',
      },
    });
    return;
  }

  const resourceSpans: OtlpResourceSpans[] = data.resourceSpans;
  const stores = getStores();
  const upsertService = getDependencyUpsertService();
  const warnings: string[] = [];
  let totalRejected = 0;
  const allChanges: StatusChangeEvent[] = [];

  for (const rs of resourceSpans) {
    try {
      const serviceName = traceParser.extractServiceName(rs);
      if (!serviceName) {
        warnings.push('Skipping resourceSpans entry: missing service.name resource attribute');
        continue;
      }

      // Find or auto-register the service
      const service = findOrCreateService(stores, teamId, serviceName, warnings);

      // Store ALL spans (full span storage for future trace timeline views)
      const spanInputs = buildSpanInputs(rs, serviceName, teamId);
      if (spanInputs.length > 0) {
        stores.spans.bulkInsert(spanInputs);
      }

      // Parse CLIENT/PRODUCER spans for dependency discovery
      const result = traceParser.parseResourceSpans(rs);
      warnings.push(...traceParser.lastWarnings);

      if (result.dependencies.length > 0) {
        // Convert trace dependencies to ProactiveDepsStatus for the upsert pipeline
        const depsStatus = bridge.bridgeToDepsStatus(result.dependencies);

        // Upsert dependencies
        const changes = upsertService.upsert(service, depsStatus);
        allChanges.push(...changes);
      }

      // Update poll result on the service
      stores.services.updatePollResult(service.id, true, undefined, warnings.length > 0 ? warnings : undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ err }, 'OTLP trace processing failed for resourceSpans entry');
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
 * Convert all spans from a resourceSpans entry into CreateSpanInput[].
 * Flattens scopeSpans → spans, precomputing duration_ms and serializing attributes.
 */
function buildSpanInputs(
  rs: OtlpResourceSpans,
  serviceName: string,
  teamId: string,
): CreateSpanInput[] {
  const inputs: CreateSpanInput[] = [];
  const resourceAttrsJson = rs.resource?.attributes
    ? JSON.stringify(rs.resource.attributes)
    : null;

  if (!Array.isArray(rs.scopeSpans)) return inputs;

  for (const ss of rs.scopeSpans) {
    if (!Array.isArray(ss.spans)) continue;

    for (const span of ss.spans) {
      const durationMs = computeDurationMs(span.startTimeUnixNano, span.endTimeUnixNano);
      const startTime = nanoToIso(span.startTimeUnixNano);
      const endTime = nanoToIso(span.endTimeUnixNano);

      inputs.push({
        trace_id: span.traceId,
        span_id: span.spanId,
        parent_span_id: span.parentSpanId ?? null,
        service_name: serviceName,
        team_id: teamId,
        name: span.name,
        kind: span.kind ?? 0,
        start_time: startTime,
        end_time: endTime,
        duration_ms: durationMs,
        status_code: span.status?.code ?? 0,
        status_message: span.status?.message ?? null,
        attributes: span.attributes ? JSON.stringify(span.attributes) : null,
        resource_attributes: resourceAttrsJson,
      });
    }
  }

  return inputs;
}

/**
 * Compute duration in milliseconds from nanosecond timestamps.
 */
function computeDurationMs(startNano: string, endNano: string): number {
  try {
    const durationNanos = BigInt(endNano) - BigInt(startNano);
    return Number(durationNanos / BigInt(1_000_000));
  } catch {
    return 0;
  }
}

/**
 * Convert nanosecond Unix timestamp to ISO 8601 string.
 */
function nanoToIso(nanoTimestamp: string): string {
  try {
    const ms = Number(BigInt(nanoTimestamp) / BigInt(1_000_000));
    return new Date(ms).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

export default router;
