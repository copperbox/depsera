import { buildEffectiveMaps, findKeyForField, isMetricSchemaConfig } from './metricSchemaUtils';
import { MetricSchemaConfig, SchemaMapping } from '../../db/types';

const DEFAULT_METRICS: Record<string, string> = {
  'dep_status': 'state',
  'dep_healthy': 'healthy',
  'dep_latency': 'latency',
};

const DEFAULT_LABELS: Record<string, string> = {
  'name': 'name',
  'type': 'type',
};

describe('buildEffectiveMaps', () => {
  it('should return defaults when no config is provided', () => {
    const result = buildEffectiveMaps(DEFAULT_METRICS, DEFAULT_LABELS);
    expect(result.metricMap).toEqual(DEFAULT_METRICS);
    expect(result.labelMap).toEqual(DEFAULT_LABELS);
    expect(result.latencyUnit).toBe('ms');
  });

  it('should return defaults when config has empty metrics and labels', () => {
    const config: MetricSchemaConfig = { metrics: {}, labels: {} };
    const result = buildEffectiveMaps(DEFAULT_METRICS, DEFAULT_LABELS, config);
    expect(result.metricMap).toEqual(DEFAULT_METRICS);
    expect(result.labelMap).toEqual(DEFAULT_LABELS);
  });

  it('should override a metric mapping', () => {
    const config: MetricSchemaConfig = {
      metrics: { my_custom_status: 'state' },
      labels: {},
    };
    const result = buildEffectiveMaps(DEFAULT_METRICS, DEFAULT_LABELS, config);
    expect(result.metricMap.my_custom_status).toBe('state');
    expect(result.metricMap.dep_status).toBeUndefined();
    // Other defaults preserved
    expect(result.metricMap.dep_healthy).toBe('healthy');
    expect(result.metricMap.dep_latency).toBe('latency');
  });

  it('should override a label mapping', () => {
    const config: MetricSchemaConfig = {
      metrics: {},
      labels: { dependency: 'name' },
    };
    const result = buildEffectiveMaps(DEFAULT_METRICS, DEFAULT_LABELS, config);
    expect(result.labelMap.dependency).toBe('name');
    expect(result.labelMap.name).toBeUndefined();
    // Other default preserved
    expect(result.labelMap.type).toBe('type');
  });

  it('should handle multiple overrides', () => {
    const config: MetricSchemaConfig = {
      metrics: { my_status: 'state', my_latency: 'latency' },
      labels: { dep: 'name', dep_type: 'type' },
    };
    const result = buildEffectiveMaps(DEFAULT_METRICS, DEFAULT_LABELS, config);
    expect(result.metricMap).toEqual({
      dep_healthy: 'healthy',
      my_status: 'state',
      my_latency: 'latency',
    });
    expect(result.labelMap).toEqual({
      dep: 'name',
      dep_type: 'type',
    });
  });

  it('should respect latency_unit from config', () => {
    const config: MetricSchemaConfig = { metrics: {}, labels: {}, latency_unit: 's' };
    const result = buildEffectiveMaps(DEFAULT_METRICS, DEFAULT_LABELS, config);
    expect(result.latencyUnit).toBe('s');
  });

  it('should default latency_unit to ms', () => {
    const config: MetricSchemaConfig = { metrics: {}, labels: {} };
    const result = buildEffectiveMaps(DEFAULT_METRICS, DEFAULT_LABELS, config);
    expect(result.latencyUnit).toBe('ms');
  });
});

describe('findKeyForField', () => {
  it('should find the key that maps to a given field', () => {
    expect(findKeyForField(DEFAULT_LABELS, 'name', 'fallback')).toBe('name');
    expect(findKeyForField(DEFAULT_LABELS, 'type', 'fallback')).toBe('type');
  });

  it('should return fallback when field not found', () => {
    expect(findKeyForField(DEFAULT_LABELS, 'missing', 'my_fallback')).toBe('my_fallback');
  });

  it('should find custom keys from overridden maps', () => {
    const customMap = { dependency: 'name', dep_type: 'type' };
    expect(findKeyForField(customMap, 'name', 'fallback')).toBe('dependency');
  });
});

describe('isMetricSchemaConfig', () => {
  it('should return true for objects with metrics key', () => {
    expect(isMetricSchemaConfig({ metrics: {}, labels: {} })).toBe(true);
  });

  it('should return true for objects with labels key only', () => {
    expect(isMetricSchemaConfig({ labels: { dep: 'name' } } as unknown as MetricSchemaConfig)).toBe(true);
  });

  it('should return false for SchemaMapping', () => {
    const schema: SchemaMapping = {
      root: 'data',
      fields: { name: 'n', healthy: 'h' },
    };
    expect(isMetricSchemaConfig(schema)).toBe(false);
  });

  it('should return false for null', () => {
    expect(isMetricSchemaConfig(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isMetricSchemaConfig(undefined)).toBe(false);
  });
});
