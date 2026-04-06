/**
 * TypeScript type definitions for the OTLP JSON export structure.
 * Based on the OpenTelemetry Protocol (OTLP) specification for metrics.
 * @see https://opentelemetry.io/docs/specs/otlp/#otlphttp
 */

export interface OtlpAnyValue {
  stringValue?: string;
  intValue?: string; // OTLP encodes int64 as string in JSON
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values: OtlpAnyValue[] };
  kvlistValue?: { values: OtlpKeyValue[] };
}

export interface OtlpKeyValue {
  key: string;
  value: OtlpAnyValue;
}

export interface OtlpNumberDataPoint {
  attributes?: OtlpKeyValue[];
  startTimeUnixNano?: string;
  timeUnixNano?: string;
  asInt?: string; // int64 encoded as string
  asDouble?: number;
}

export interface OtlpGauge {
  dataPoints: OtlpNumberDataPoint[];
}

// Histogram types (DPS-110h)
export interface OtlpHistogramDataPoint {
  attributes?: OtlpKeyValue[];
  startTimeUnixNano?: string;
  timeUnixNano?: string;
  count?: string; // uint64 encoded as string
  sum?: number;
  min?: number;
  max?: number;
  bucketCounts: string[]; // uint64[] encoded as strings
  explicitBounds: number[];
}

export interface OtlpHistogram {
  dataPoints: OtlpHistogramDataPoint[];
  aggregationTemporality?: number; // 1=DELTA, 2=CUMULATIVE
}

// Sum types (DPS-110h)
export interface OtlpSum {
  dataPoints: OtlpNumberDataPoint[];
  aggregationTemporality?: number; // 1=DELTA, 2=CUMULATIVE
  isMonotonic?: boolean;
}

export interface OtlpMetric {
  name: string;
  description?: string;
  unit?: string;
  gauge?: OtlpGauge;
  histogram?: OtlpHistogram;
  sum?: OtlpSum;
}

export interface OtlpScopeMetrics {
  scope?: {
    name?: string;
    version?: string;
    attributes?: OtlpKeyValue[];
  };
  metrics: OtlpMetric[];
}

export interface OtlpResourceMetrics {
  resource?: {
    attributes?: OtlpKeyValue[];
  };
  scopeMetrics: OtlpScopeMetrics[];
}

export interface OtlpExportMetricsServiceRequest {
  resourceMetrics: OtlpResourceMetrics[];
}

// OTLP Trace types (DPS-110g)

export interface OtlpSpanStatus {
  code?: number; // 0=UNSET, 1=OK, 2=ERROR
  message?: string;
}

/** Span kind enum: 0=UNSPECIFIED, 1=INTERNAL, 2=SERVER, 3=CLIENT, 4=PRODUCER, 5=CONSUMER */
export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes?: OtlpKeyValue[];
  status?: OtlpSpanStatus;
}

export interface OtlpScopeSpans {
  scope?: {
    name?: string;
    version?: string;
    attributes?: OtlpKeyValue[];
  };
  spans: OtlpSpan[];
}

export interface OtlpResourceSpans {
  resource?: {
    attributes?: OtlpKeyValue[];
  };
  scopeSpans: OtlpScopeSpans[];
}

export interface OtlpExportTraceServiceRequest {
  resourceSpans: OtlpResourceSpans[];
}
