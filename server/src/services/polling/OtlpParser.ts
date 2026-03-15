import { ProactiveDepsStatus, HealthState, DependencyType } from '../../db/types';
import {
  OtlpExportMetricsServiceRequest,
  OtlpResourceMetrics,
  OtlpKeyValue,
  OtlpAnyValue,
  OtlpNumberDataPoint,
} from './otlp-types';

export interface OtlpParseResult {
  serviceName: string;
  dependencies: ProactiveDepsStatus[];
}

/** Metric name → field it maps to */
const METRIC_MAP: Record<string, string> = {
  'dependency.health.status': 'state',
  'dependency.health.healthy': 'healthy',
  'dependency.health.latency': 'latency',
  'dependency.health.code': 'code',
  'dependency.health.check_skipped': 'skipped',
};

/** Attribute key → field it maps to */
const ATTRIBUTE_MAP: Record<string, string> = {
  'dependency.name': 'name',
  'dependency.type': 'type',
  'dependency.impact': 'impact',
  'dependency.description': 'description',
  'dependency.error_message': 'errorMessage',
};

/**
 * Parses OTLP JSON metric payloads into ProactiveDepsStatus arrays.
 * Extracts service.name from resource attributes and maps gauge metrics
 * to dependency health fields.
 */
export class OtlpParser {
  private _lastWarnings: string[] = [];

  get lastWarnings(): string[] {
    return this._lastWarnings;
  }

  /**
   * Parse an OTLP ExportMetricsServiceRequest into per-service results.
   * Each resourceMetrics entry may represent a different service.
   */
  parseRequest(data: unknown): OtlpParseResult[] {
    this._lastWarnings = [];

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid OTLP payload: expected object');
    }

    const request = data as OtlpExportMetricsServiceRequest;

    if (!Array.isArray(request.resourceMetrics)) {
      throw new Error('Invalid OTLP payload: missing resourceMetrics array');
    }

    const results: OtlpParseResult[] = [];

    for (const rm of request.resourceMetrics) {
      results.push(this.parseResourceMetrics(rm));
    }

    return results;
  }

  private parseResourceMetrics(rm: OtlpResourceMetrics): OtlpParseResult {
    const serviceName = this.extractServiceName(rm);

    if (!serviceName) {
      throw new Error('OTLP payload missing required resource attribute: service.name');
    }

    // Collect all data points across all scope metrics, grouped by dependency name
    const depMap = new Map<string, Record<string, unknown>>();

    if (!Array.isArray(rm.scopeMetrics)) {
      return { serviceName, dependencies: [] };
    }

    for (const sm of rm.scopeMetrics) {
      if (!Array.isArray(sm.metrics)) continue;

      for (const metric of sm.metrics) {
        const field = METRIC_MAP[metric.name];
        if (!field) {
          // Unknown metric — skip silently
          continue;
        }

        if (!metric.gauge?.dataPoints) continue;

        for (const dp of metric.gauge.dataPoints) {
          const attrs = this.extractAttributes(dp);
          const depName = attrs.name as string | undefined;

          if (!depName) {
            throw new Error(
              `OTLP data point for metric "${metric.name}" missing required attribute: dependency.name`
            );
          }

          if (!depMap.has(depName)) {
            depMap.set(depName, { ...attrs });
          }

          const entry = depMap.get(depName)!;
          // Merge attributes (later data points can fill in missing attrs)
          for (const [k, v] of Object.entries(attrs)) {
            if (entry[k] === undefined) {
              entry[k] = v;
            }
          }

          // Set the metric value
          entry[field] = this.extractDataPointValue(dp);

          // Capture timestamp from the data point
          if (dp.timeUnixNano && !entry._timeUnixNano) {
            entry._timeUnixNano = dp.timeUnixNano;
          }
        }
      }
    }

    const dependencies = Array.from(depMap.entries()).map(([name, fields]) =>
      this.buildDependency(name, fields)
    );

    return { serviceName, dependencies };
  }

  private extractServiceName(rm: OtlpResourceMetrics): string | undefined {
    const attrs = rm.resource?.attributes;
    if (!Array.isArray(attrs)) return undefined;

    for (const kv of attrs) {
      if (kv.key === 'service.name') {
        return this.unwrapValue(kv.value) as string | undefined;
      }
    }
    return undefined;
  }

  private extractAttributes(dp: OtlpNumberDataPoint): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (!Array.isArray(dp.attributes)) return result;

    for (const kv of dp.attributes) {
      const field = ATTRIBUTE_MAP[kv.key];
      if (field) {
        result[field] = this.unwrapValue(kv.value);
      }
    }
    return result;
  }

  private unwrapValue(value: OtlpAnyValue | undefined): string | number | boolean | undefined {
    if (!value) return undefined;
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.intValue !== undefined) return parseInt(value.intValue, 10);
    if (value.doubleValue !== undefined) return value.doubleValue;
    if (value.boolValue !== undefined) return value.boolValue;
    return undefined;
  }

  private extractDataPointValue(dp: OtlpNumberDataPoint): number {
    if (dp.asInt !== undefined) return parseInt(dp.asInt, 10);
    if (dp.asDouble !== undefined) return dp.asDouble;
    return 0;
  }

  private buildDependency(name: string, fields: Record<string, unknown>): ProactiveDepsStatus {
    const state = typeof fields.state === 'number' ? (fields.state as HealthState) : 0;
    const healthy = fields.healthy !== undefined ? fields.healthy === 1 : state !== 2;
    const latency = typeof fields.latency === 'number' ? fields.latency : 0;
    const code = typeof fields.code === 'number' ? fields.code : 200;
    const skipped = fields.skipped === 1;

    // Convert timeUnixNano to ISO string
    let lastChecked: string;
    if (fields._timeUnixNano && typeof fields._timeUnixNano === 'string') {
      const nanos = BigInt(fields._timeUnixNano);
      const millis = Number(nanos / BigInt(1_000_000));
      lastChecked = new Date(millis).toISOString();
    } else {
      lastChecked = new Date().toISOString();
    }

    const depType: DependencyType =
      typeof fields.type === 'string' && fields.type.trim() !== ''
        ? (fields.type as DependencyType)
        : 'other';

    return {
      name,
      description: typeof fields.description === 'string' ? fields.description : undefined,
      impact: typeof fields.impact === 'string' ? fields.impact : undefined,
      type: depType,
      healthy,
      health: {
        state,
        code,
        latency,
        ...(skipped && { skipped: true }),
      },
      lastChecked,
      errorMessage: typeof fields.errorMessage === 'string' ? fields.errorMessage : undefined,
    };
  }
}
