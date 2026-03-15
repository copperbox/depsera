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

export interface OtlpMetric {
  name: string;
  description?: string;
  unit?: string;
  gauge?: OtlpGauge;
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
