import { ProactiveDepsStatus, HealthState, DependencyType, MetricSchemaConfig } from '../../db/types';
import {
  OtlpExportMetricsServiceRequest,
  OtlpResourceMetrics,
  OtlpAnyValue,
  OtlpNumberDataPoint,
  OtlpKeyValue,
} from './otlp-types';
import { buildEffectiveMaps, findKeyForField } from './metricSchemaUtils';
import { computePercentiles } from '../../utils/histogramPercentiles';

export interface OtlpParseResult {
  serviceName: string;
  dependencies: ProactiveDepsStatus[];
}

/** Metric name → field it maps to */
const DEFAULT_METRIC_MAP: Record<string, string> = {
  'dependency.health.status': 'state',
  'dependency.health.healthy': 'healthy',
  'dependency.health.latency': 'latency',
  'dependency.health.code': 'code',
  'dependency.health.check_skipped': 'skipped',
};

/** Attribute key → field it maps to */
const DEFAULT_ATTRIBUTE_MAP: Record<string, string> = {
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
  parseRequest(data: unknown, config?: MetricSchemaConfig): OtlpParseResult[] {
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
      results.push(this.parseResourceMetrics(rm, config));
    }

    return results;
  }

  parseResourceMetrics(rm: OtlpResourceMetrics, config?: MetricSchemaConfig): OtlpParseResult {
    const serviceName = this.extractServiceName(rm);

    if (!serviceName) {
      throw new Error('OTLP payload missing required resource attribute: service.name');
    }

    const { metricMap, labelMap, latencyUnit, healthyValue } = buildEffectiveMaps(
      DEFAULT_METRIC_MAP, DEFAULT_ATTRIBUTE_MAP, config
    );

    // Collect all data points across all scope metrics, grouped by dependency name
    const depMap = new Map<string, Record<string, unknown>>();

    if (!Array.isArray(rm.scopeMetrics)) {
      return { serviceName, dependencies: [] };
    }

    for (const sm of rm.scopeMetrics) {
      if (!Array.isArray(sm.metrics)) continue;

      for (const metric of sm.metrics) {
        // Process gauge data points (existing behavior)
        const field = metricMap[metric.name];
        if (field && metric.gauge?.dataPoints) {
          for (const dp of metric.gauge.dataPoints) {
            const attrs = this.extractAttributes(dp, labelMap);
            const depName = attrs.name as string | undefined;

            if (!depName) {
              const nameAttrKey = findKeyForField(labelMap, 'name', 'dependency.name');
              throw new Error(
                `OTLP data point for metric "${metric.name}" missing required attribute: ${nameAttrKey}`
              );
            }

            if (!depMap.has(depName)) {
              depMap.set(depName, { ...attrs });
            }

            const entry = depMap.get(depName)!;
            // Merge attributes (later data points can fill in missing attrs)
            for (const [k, v] of Object.entries(attrs)) {
              if (entry[k] === undefined) { // eslint-disable-line security/detect-object-injection
                entry[k] = v; // eslint-disable-line security/detect-object-injection
              }
            }

            // Set the metric value
            entry[field] = this.extractDataPointValue(dp); // eslint-disable-line security/detect-object-injection

            // Capture timestamp from the data point
            if (dp.timeUnixNano && !entry._timeUnixNano) {
              entry._timeUnixNano = dp.timeUnixNano;
            }
          }
        }

        // Process histogram data points — extract percentile latency
        if (metric.histogram?.dataPoints) {
          const unitMultiplier = this.getUnitMultiplier(metric.unit);

          for (const dp of metric.histogram.dataPoints) {
            const depName = this.extractDepNameFromKeyValues(dp.attributes, labelMap);
            if (!depName) continue;

            if (!depMap.has(depName)) {
              depMap.set(depName, this.extractAttributesFromKeyValues(dp.attributes, labelMap));
            }

            const entry = depMap.get(depName)!;

            const bucketCounts = (dp.bucketCounts ?? []).map((c) => parseInt(c, 10) || 0);
            const count = dp.count !== undefined ? parseInt(dp.count, 10) : undefined;

            const percentiles = computePercentiles(
              {
                explicitBounds: dp.explicitBounds ?? [],
                bucketCounts,
                sum: dp.sum,
                count,
                min: dp.min,
                max: dp.max,
              },
              unitMultiplier,
            );

            entry._percentiles = percentiles;

            // Use average from histogram as the latency if no gauge latency set
            if (entry.latency === undefined && percentiles.avgMs > 0) {
              entry.latency = Math.round(percentiles.avgMs);
            }

            if (dp.timeUnixNano && !entry._timeUnixNano) {
              entry._timeUnixNano = dp.timeUnixNano;
            }
          }
        }

        // Process sum data points
        if (metric.sum?.dataPoints) {
          for (const dp of metric.sum.dataPoints) {
            const depName = this.extractDepNameFromKeyValues(dp.attributes, labelMap);
            if (!depName) continue;

            if (!depMap.has(depName)) {
              depMap.set(depName, this.extractAttributesFromKeyValues(dp.attributes, labelMap));
            }

            const entry = depMap.get(depName)!;
            const value = this.extractDataPointValue(dp);

            if (metric.sum!.isMonotonic === false) {
              // Non-monotonic sum — treat as gauge value
              const sumField = metricMap[metric.name];
              if (sumField) {
                entry[sumField] = value; // eslint-disable-line security/detect-object-injection
              }
            } else {
              // Monotonic sum — store raw count as requestCount
              entry._requestCount = value;
            }

            if (dp.timeUnixNano && !entry._timeUnixNano) {
              entry._timeUnixNano = dp.timeUnixNano;
            }
          }
        }
      }
    }

    const dependencies = Array.from(depMap.entries()).map(([name, fields]) =>
      this.buildDependency(name, fields, latencyUnit, healthyValue)
    );

    return { serviceName, dependencies };
  }

  extractServiceName(rm: OtlpResourceMetrics): string | undefined {
    const attrs = rm.resource?.attributes;
    if (!Array.isArray(attrs)) return undefined;

    for (const kv of attrs) {
      if (kv.key === 'service.name') {
        return this.unwrapValue(kv.value) as string | undefined;
      }
    }
    return undefined;
  }

  private extractAttributes(dp: OtlpNumberDataPoint, attrMap: Record<string, string>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (!Array.isArray(dp.attributes)) return result;

    for (const kv of dp.attributes) {
      const field = attrMap[kv.key];
      if (field) {
        result[field] = this.unwrapValue(kv.value); // eslint-disable-line security/detect-object-injection
      }
    }
    return result;
  }

  /**
   * Extract attributes from OtlpKeyValue[] (used by histogram/sum data points).
   */
  private extractAttributesFromKeyValues(attrs: OtlpKeyValue[] | undefined, attrMap: Record<string, string>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (!Array.isArray(attrs)) return result;

    for (const kv of attrs) {
      const field = attrMap[kv.key];
      if (field) {
        result[field] = this.unwrapValue(kv.value); // eslint-disable-line security/detect-object-injection
      }
    }
    return result;
  }

  /**
   * Extract dependency name from OtlpKeyValue[] attributes.
   */
  private extractDepNameFromKeyValues(attrs: OtlpKeyValue[] | undefined, attrMap: Record<string, string>): string | undefined {
    if (!Array.isArray(attrs)) return undefined;

    for (const kv of attrs) {
      const field = attrMap[kv.key];
      if (field === 'name') {
        const val = this.unwrapValue(kv.value);
        return typeof val === 'string' ? val : undefined;
      }
    }
    return undefined;
  }

  /**
   * Determine unit multiplier for converting metric values to milliseconds.
   * OTel convention: latency in seconds → multiply by 1000 for ms.
   */
  private getUnitMultiplier(unit?: string): number {
    if (!unit) return 1000; // default: assume seconds (OTel convention)
    const lower = unit.toLowerCase();
    if (lower === 'ms' || lower === 'milliseconds') return 1;
    if (lower === 'us' || lower === 'microseconds') return 0.001;
    if (lower === 'ns' || lower === 'nanoseconds') return 0.000001;
    // Default to seconds → ms
    return 1000;
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

  private buildDependency(name: string, fields: Record<string, unknown>, latencyUnit: 'ms' | 's', healthyValue: number = 1): ProactiveDepsStatus {
    const state = typeof fields.state === 'number' ? (fields.state as HealthState) : 0;
    const healthy = fields.healthy !== undefined ? fields.healthy === healthyValue : state !== 2;
    const rawLatency = typeof fields.latency === 'number' ? fields.latency : 0;
    const latency = latencyUnit === 's' ? Math.round(rawLatency * 1000) : rawLatency;
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

    // Build percentiles from histogram data if present
    const percentiles = fields._percentiles as { p50: number; p95: number; p99: number; min: number; max: number; count: number } | undefined;
    const requestCount = typeof fields._requestCount === 'number' ? fields._requestCount : undefined;

    const healthPercentiles = percentiles || requestCount !== undefined
      ? {
          ...(percentiles && {
            p50: percentiles.p50,
            p95: percentiles.p95,
            p99: percentiles.p99,
            min: percentiles.min,
            max: percentiles.max,
          }),
          ...(requestCount !== undefined && { requestCount }),
        }
      : undefined;

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
        ...(healthPercentiles && { percentiles: healthPercentiles }),
      },
      lastChecked,
      errorMessage: typeof fields.errorMessage === 'string' ? fields.errorMessage : undefined,
    };
  }
}
