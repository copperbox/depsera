import { MetricSchemaConfig, SchemaMapping } from '../../db/types';

export interface EffectiveMaps {
  metricMap: Record<string, string>;
  labelMap: Record<string, string>;
  latencyUnit: 'ms' | 's';
  healthyValue: number;
}

/**
 * Build effective metric and label maps by merging user overrides into defaults.
 * When a user overrides a target field, the default entry for that field is removed
 * and replaced with the user's mapping.
 */
export function buildEffectiveMaps(
  defaultMetrics: Record<string, string>,
  defaultLabels: Record<string, string>,
  config?: MetricSchemaConfig,
): EffectiveMaps {
  if (!config) {
    return {
      metricMap: { ...defaultMetrics },
      labelMap: { ...defaultLabels },
      latencyUnit: 'ms',
      healthyValue: 1,
    };
  }

  const metricMap = { ...defaultMetrics };
  const labelMap = { ...defaultLabels };

  // Override metric mappings
  if (config.metrics && Object.keys(config.metrics).length > 0) {
    const overriddenFields = new Set(Object.values(config.metrics));
    for (const [key, field] of Object.entries(metricMap)) {
      if (overriddenFields.has(field)) {
        delete metricMap[key];
      }
    }
    Object.assign(metricMap, config.metrics);
  }

  // Override label mappings
  if (config.labels && Object.keys(config.labels).length > 0) {
    const overriddenFields = new Set(Object.values(config.labels));
    for (const [key, field] of Object.entries(labelMap)) {
      if (overriddenFields.has(field)) {
        delete labelMap[key];
      }
    }
    Object.assign(labelMap, config.labels);
  }

  return {
    metricMap,
    labelMap,
    latencyUnit: config.latency_unit ?? 'ms',
    healthyValue: config.healthy_value ?? 1,
  };
}

/**
 * Find the key in a map that maps to a given target field.
 */
export function findKeyForField(
  map: Record<string, string>,
  field: string,
  fallback: string,
): string {
  const entry = Object.entries(map).find(([, f]) => f === field);
  return entry ? entry[0] : fallback;
}

/**
 * Type guard to distinguish MetricSchemaConfig from SchemaMapping.
 * MetricSchemaConfig has metrics+labels, SchemaMapping has root+fields.
 */
export function isMetricSchemaConfig(
  config: SchemaMapping | MetricSchemaConfig | null | undefined
): config is MetricSchemaConfig {
  if (!config || typeof config !== 'object') return false;
  return 'metrics' in config || 'labels' in config;
}
