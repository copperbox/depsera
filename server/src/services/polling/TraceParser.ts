import { DependencyType } from '../../db/types';
import {
  OtlpExportTraceServiceRequest,
  OtlpResourceSpans,
  OtlpSpan,
  OtlpAnyValue,
  OtlpKeyValue,
} from './otlp-types';

/** Span kind constants per OTel spec */
export const SpanKind = {
  UNSPECIFIED: 0,
  INTERNAL: 1,
  SERVER: 2,
  CLIENT: 3,
  PRODUCER: 4,
  CONSUMER: 5,
} as const;

/** OTel status code constants */
export const SpanStatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
} as const;

/** Cache systems that map to 'cache' type instead of 'database' */
const CACHE_SYSTEMS = new Set(['redis', 'memcached', 'valkey']);

export interface TraceDependency {
  targetName: string;
  type: DependencyType;
  latencyMs: number;
  isError: boolean;
  spanKind: number;
  description: string;
  attributes: Record<string, string | number | boolean>;
}

export interface TraceDependencyResult {
  serviceName: string;
  dependencies: TraceDependency[];
}

/**
 * Parses OTLP trace payloads, extracting dependency information from
 * CLIENT and PRODUCER spans. Mirrors OtlpParser's structure for metrics.
 */
export class TraceParser {
  private _lastWarnings: string[] = [];

  get lastWarnings(): string[] {
    return this._lastWarnings;
  }

  /**
   * Parse an OTLP ExportTraceServiceRequest into per-service results.
   * Each resourceSpans entry may represent a different service.
   */
  parseRequest(data: unknown): TraceDependencyResult[] {
    this._lastWarnings = [];

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid OTLP trace payload: expected object');
    }

    const request = data as OtlpExportTraceServiceRequest;

    if (!Array.isArray(request.resourceSpans)) {
      throw new Error('Invalid OTLP trace payload: missing resourceSpans array');
    }

    const results: TraceDependencyResult[] = [];

    for (const rs of request.resourceSpans) {
      results.push(this.parseResourceSpans(rs));
    }

    return results;
  }

  /**
   * Parse a single resourceSpans entry into a TraceDependencyResult.
   * Only CLIENT (kind=3) and PRODUCER (kind=4) spans produce dependencies.
   */
  parseResourceSpans(rs: OtlpResourceSpans): TraceDependencyResult {
    const serviceName = this.extractServiceName(rs);

    if (!serviceName) {
      throw new Error('OTLP trace payload missing required resource attribute: service.name');
    }

    const allSpans = this.collectSpans(rs);

    // Filter to CLIENT and PRODUCER spans for dependency discovery
    const depSpans = allSpans.filter(
      (s) => s.kind === SpanKind.CLIENT || s.kind === SpanKind.PRODUCER
    );

    // Build dependencies, deduplicating by target name
    const depMap = new Map<string, { totalLatency: number; count: number; isError: boolean; type: DependencyType; spanKind: number; description: string; attributes: Record<string, string | number | boolean> }>();

    for (const span of depSpans) {
      const targetName = this.resolveTargetName(span);
      if (!targetName) {
        this._lastWarnings.push(
          `Span "${span.name}" (${span.spanId}) has no resolvable target name — skipped for dependency discovery`
        );
        continue;
      }

      const latencyMs = this.computeLatencyMs(span);
      const isError = span.status?.code === SpanStatusCode.ERROR;
      const type = this.inferDependencyType(span);
      const description = this.generateDescription(span);
      const attributes = this.extractSpanAttributes(span);

      const existing = depMap.get(targetName);
      if (existing) {
        // Aggregate: average latency, any-error-wins
        existing.totalLatency += latencyMs;
        existing.count += 1;
        if (isError) existing.isError = true;
      } else {
        depMap.set(targetName, {
          totalLatency: latencyMs,
          count: 1,
          isError,
          type,
          spanKind: span.kind ?? SpanKind.UNSPECIFIED,
          description,
          attributes,
        });
      }
    }

    const dependencies: TraceDependency[] = Array.from(depMap.entries()).map(
      ([targetName, agg]) => ({
        targetName,
        type: agg.type,
        latencyMs: Math.round(agg.totalLatency / agg.count),
        isError: agg.isError,
        spanKind: agg.spanKind,
        description: agg.description,
        attributes: agg.attributes,
      })
    );

    return { serviceName, dependencies };
  }

  /**
   * Extract service.name from resource attributes.
   * Reuses the same pattern as OtlpParser.
   */
  extractServiceName(rs: OtlpResourceSpans): string | undefined {
    const attrs = rs.resource?.attributes;
    if (!Array.isArray(attrs)) return undefined;

    for (const kv of attrs) {
      if (kv.key === 'service.name') {
        return this.unwrapValue(kv.value) as string | undefined;
      }
    }
    return undefined;
  }

  /**
   * Collect all spans from all scope spans in a resource.
   */
  private collectSpans(rs: OtlpResourceSpans): OtlpSpan[] {
    const spans: OtlpSpan[] = [];
    if (!Array.isArray(rs.scopeSpans)) return spans;

    for (const ss of rs.scopeSpans) {
      if (!Array.isArray(ss.spans)) continue;
      spans.push(...ss.spans);
    }
    return spans;
  }

  /**
   * Resolve the target dependency name from span attributes.
   * Priority chain: peer.service → db.system/db.system.name →
   * messaging.system → rpc.system/rpc.system.name → server.address →
   * hostname from url.full
   */
  private resolveTargetName(span: OtlpSpan): string | undefined {
    const attrs = this.buildAttrMap(span.attributes);

    // 1. peer.service — explicit dependency name
    const peerService = attrs['peer.service'];
    if (peerService) return String(peerService);

    // 2. db.system / db.system.name — database system
    const dbSystem = attrs['db.system'] ?? attrs['db.system.name'];
    if (dbSystem) return String(dbSystem);

    // 3. messaging.system — message broker
    const messagingSystem = attrs['messaging.system'];
    if (messagingSystem) return String(messagingSystem);

    // 4. rpc.system / rpc.system.name — RPC framework
    const rpcSystem = attrs['rpc.system'] ?? attrs['rpc.system.name'];
    if (rpcSystem) return String(rpcSystem);

    // 5. server.address — target host
    const serverAddress = attrs['server.address'];
    if (serverAddress) return String(serverAddress);

    // 6. hostname from url.full
    const urlFull = attrs['url.full'];
    if (urlFull) {
      try {
        const url = new URL(String(urlFull));
        return url.hostname;
      } catch {
        // Invalid URL — skip
      }
    }

    return undefined;
  }

  /**
   * Infer the dependency type from span attributes.
   * db.system → database/cache, messaging → message_queue,
   * rpc grpc → grpc, http → rest, else other
   */
  private inferDependencyType(span: OtlpSpan): DependencyType {
    const attrs = this.buildAttrMap(span.attributes);

    // Database or cache
    const dbSystem = attrs['db.system'] ?? attrs['db.system.name'];
    if (dbSystem) {
      return CACHE_SYSTEMS.has(String(dbSystem).toLowerCase()) ? 'cache' : 'database';
    }

    // Message queue
    if (attrs['messaging.system']) return 'message_queue';

    // gRPC
    const rpcSystem = attrs['rpc.system'] ?? attrs['rpc.system.name'];
    if (rpcSystem && String(rpcSystem).toLowerCase() === 'grpc') return 'grpc';

    // HTTP/REST
    if (attrs['http.request.method'] || attrs['http.method']) return 'rest';

    return 'other';
  }

  /**
   * Auto-generate a human-readable description from span attributes.
   * HTTP: "{method} {host}{path}", DB: "{op} {namespace}.{collection}",
   * messaging: "{op} {destination}", gRPC: "{rpc.method}"
   */
  private generateDescription(span: OtlpSpan): string {
    const attrs = this.buildAttrMap(span.attributes);

    // HTTP description
    const httpMethod = attrs['http.request.method'] ?? attrs['http.method'];
    if (httpMethod) {
      const host = attrs['server.address'] ?? attrs['net.peer.name'] ?? '';
      const path = attrs['url.path'] ?? attrs['http.target'] ?? '';
      const parts = [String(httpMethod)];
      if (host || path) parts.push(`${host}${path}`);
      return parts.join(' ');
    }

    // DB description
    const dbSystem = attrs['db.system'] ?? attrs['db.system.name'];
    if (dbSystem) {
      const op = attrs['db.operation'] ?? attrs['db.operation.name'] ?? '';
      const ns = attrs['db.namespace'] ?? attrs['db.name'] ?? '';
      const collection = attrs['db.collection.name'] ?? attrs['db.sql.table'] ?? '';
      const parts: string[] = [];
      if (op) parts.push(String(op));
      const target = [ns, collection].filter(Boolean).join('.');
      if (target) parts.push(target);
      return parts.join(' ') || String(dbSystem);
    }

    // Messaging description
    const messagingSystem = attrs['messaging.system'];
    if (messagingSystem) {
      const op = attrs['messaging.operation'] ?? attrs['messaging.operation.name'] ?? '';
      const dest = attrs['messaging.destination.name'] ?? attrs['messaging.destination'] ?? '';
      const parts: string[] = [];
      if (op) parts.push(String(op));
      if (dest) parts.push(String(dest));
      return parts.join(' ') || String(messagingSystem);
    }

    // gRPC description
    const rpcMethod = attrs['rpc.method'];
    if (rpcMethod) {
      const rpcService = attrs['rpc.service'] ?? '';
      return rpcService ? `${rpcService}/${rpcMethod}` : String(rpcMethod);
    }

    // Fallback to span name
    return span.name;
  }

  /**
   * Compute span duration in milliseconds from nanosecond timestamps.
   * Uses BigInt for precision with large nanosecond values.
   */
  private computeLatencyMs(span: OtlpSpan): number {
    try {
      const startNanos = BigInt(span.startTimeUnixNano);
      const endNanos = BigInt(span.endTimeUnixNano);
      const durationNanos = endNanos - startNanos;
      return Number(durationNanos / BigInt(1_000_000));
    } catch {
      return 0;
    }
  }

  /**
   * Build a flat key→value map from OtlpKeyValue attributes.
   */
  private buildAttrMap(
    attributes?: OtlpKeyValue[]
  ): Record<string, string | number | boolean> {
    const map: Record<string, string | number | boolean> = {};
    if (!Array.isArray(attributes)) return map;

    for (const kv of attributes) {
      const val = this.unwrapValue(kv.value);
      if (val !== undefined) {
        map[kv.key] = val;
      }
    }
    return map;
  }

  /**
   * Extract interesting span attributes as a flat record.
   * Captures the attributes that were used for resolution.
   */
  private extractSpanAttributes(
    span: OtlpSpan
  ): Record<string, string | number | boolean> {
    return this.buildAttrMap(span.attributes);
  }

  /**
   * Unwrap an OtlpAnyValue to a primitive. Same logic as OtlpParser.
   */
  private unwrapValue(
    value: OtlpAnyValue | undefined
  ): string | number | boolean | undefined {
    if (!value) return undefined;
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.intValue !== undefined) return parseInt(value.intValue, 10);
    if (value.doubleValue !== undefined) return value.doubleValue;
    if (value.boolValue !== undefined) return value.boolValue;
    return undefined;
  }
}
