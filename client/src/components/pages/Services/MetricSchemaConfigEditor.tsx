import { useState, useCallback } from 'react';
import type { MetricSchemaConfig } from '../../../types/service';
import styles from './MetricSchemaConfigEditor.module.css';

interface MetricSchemaConfigEditorProps {
  value: MetricSchemaConfig | null;
  onChange: (value: MetricSchemaConfig | null) => void;
  format: 'prometheus' | 'otlp';
  disabled?: boolean;
}

interface MappingRow {
  key: string;
  field: string;
}

const METRIC_FIELDS = ['state', 'healthy', 'latency', 'code', 'skipped'] as const;
const LABEL_FIELDS = ['name', 'type', 'impact', 'description', 'errorMessage'] as const;

const PROMETHEUS_METRIC_DEFAULTS: Record<string, string> = {
  dependency_health_status: 'state',
  dependency_health_healthy: 'healthy',
  dependency_health_latency_ms: 'latency',
  dependency_health_code: 'code',
  dependency_health_check_skipped: 'skipped',
};

const OTLP_METRIC_DEFAULTS: Record<string, string> = {
  'dependency.health.status': 'state',
  'dependency.health.healthy': 'healthy',
  'dependency.health.latency': 'latency',
  'dependency.health.code': 'code',
  'dependency.health.check_skipped': 'skipped',
};

const PROMETHEUS_LABEL_DEFAULTS: Record<string, string> = {
  name: 'name',
  type: 'type',
  impact: 'impact',
  description: 'description',
  error_message: 'errorMessage',
};

const OTLP_LABEL_DEFAULTS: Record<string, string> = {
  'dependency.name': 'name',
  'dependency.type': 'type',
  'dependency.impact': 'impact',
  'dependency.description': 'description',
  'dependency.error_message': 'errorMessage',
};

function recordToRows(record: Record<string, string> | undefined): MappingRow[] {
  if (!record || Object.keys(record).length === 0) return [];
  return Object.entries(record).map(([key, field]) => ({ key, field }));
}

function rowsToRecord(rows: MappingRow[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.trim()) {
      record[row.key.trim()] = row.field;
    }
  }
  return record;
}

function isConfigEmpty(
  metricRows: MappingRow[],
  labelRows: MappingRow[],
  latencyUnit: 'ms' | 's',
  healthyValue: string,
): boolean {
  const hasMetrics = metricRows.some((r) => r.key.trim());
  const hasLabels = labelRows.some((r) => r.key.trim());
  const hasCustomHealthyValue = healthyValue.trim() !== '' && healthyValue.trim() !== '1';
  return !hasMetrics && !hasLabels && latencyUnit === 'ms' && !hasCustomHealthyValue;
}

function MetricSchemaConfigEditor({
  value,
  onChange,
  format,
  disabled,
}: MetricSchemaConfigEditorProps) {
  const [metricRows, setMetricRows] = useState<MappingRow[]>(
    () => recordToRows(value?.metrics),
  );
  const [labelRows, setLabelRows] = useState<MappingRow[]>(
    () => recordToRows(value?.labels),
  );
  const [latencyUnit, setLatencyUnit] = useState<'ms' | 's'>(
    value?.latency_unit ?? 'ms',
  );
  const [healthyValue, setHealthyValue] = useState<string>(
    value?.healthy_value !== undefined ? String(value.healthy_value) : '',
  );

  const metricDefaults = format === 'prometheus' ? PROMETHEUS_METRIC_DEFAULTS : OTLP_METRIC_DEFAULTS;
  const labelDefaults = format === 'prometheus' ? PROMETHEUS_LABEL_DEFAULTS : OTLP_LABEL_DEFAULTS;

  const emitChange = useCallback(
    (newMetricRows: MappingRow[], newLabelRows: MappingRow[], newLatencyUnit: 'ms' | 's', newHealthyValue: string) => {
      if (isConfigEmpty(newMetricRows, newLabelRows, newLatencyUnit, newHealthyValue)) {
        onChange(null);
      } else {
        const metrics = rowsToRecord(newMetricRows);
        const labels = rowsToRecord(newLabelRows);
        const parsedHealthyValue = newHealthyValue.trim() !== '' ? parseFloat(newHealthyValue) : undefined;
        onChange({
          metrics,
          labels,
          latency_unit: newLatencyUnit,
          ...(parsedHealthyValue !== undefined && !isNaN(parsedHealthyValue) && { healthy_value: parsedHealthyValue }),
        });
      }
    },
    [onChange],
  );

  const handleAddMetric = () => {
    const newRows = [...metricRows, { key: '', field: METRIC_FIELDS[0] }];
    setMetricRows(newRows);
    // Don't emit yet — key is empty
  };

  const handleRemoveMetric = (index: number) => {
    const newRows = metricRows.filter((_, i) => i !== index);
    setMetricRows(newRows);
    emitChange(newRows, labelRows, latencyUnit, healthyValue);
  };

  const handleMetricKeyChange = (index: number, key: string) => {
    const newRows = metricRows.map((r, i) => (i === index ? { ...r, key } : r));
    setMetricRows(newRows);
    emitChange(newRows, labelRows, latencyUnit, healthyValue);
  };

  const handleMetricFieldChange = (index: number, field: string) => {
    const newRows = metricRows.map((r, i) => (i === index ? { ...r, field } : r));
    setMetricRows(newRows);
    emitChange(newRows, labelRows, latencyUnit, healthyValue);
  };

  const handleAddLabel = () => {
    const newRows = [...labelRows, { key: '', field: LABEL_FIELDS[0] }];
    setLabelRows(newRows);
  };

  const handleRemoveLabel = (index: number) => {
    const newRows = labelRows.filter((_, i) => i !== index);
    setLabelRows(newRows);
    emitChange(metricRows, newRows, latencyUnit, healthyValue);
  };

  const handleLabelKeyChange = (index: number, key: string) => {
    const newRows = labelRows.map((r, i) => (i === index ? { ...r, key } : r));
    setLabelRows(newRows);
    emitChange(metricRows, newRows, latencyUnit, healthyValue);
  };

  const handleLabelFieldChange = (index: number, field: string) => {
    const newRows = labelRows.map((r, i) => (i === index ? { ...r, field } : r));
    setLabelRows(newRows);
    emitChange(metricRows, newRows, latencyUnit, healthyValue);
  };

  const handleLatencyUnitChange = (unit: 'ms' | 's') => {
    setLatencyUnit(unit);
    emitChange(metricRows, labelRows, unit, healthyValue);
  };

  const handleHealthyValueChange = (val: string) => {
    setHealthyValue(val);
    emitChange(metricRows, labelRows, latencyUnit, val);
  };

  const renderDefaults = (defaults: Record<string, string>) => (
    <div className={styles.defaultsList}>
      {Object.entries(defaults).map(([k, v]) => (
        <span key={k}>{k} &rarr; {v}</span>
      ))}
    </div>
  );

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Metric Schema Configuration</span>
        <span className={styles.hint}>
          Map your metric names and labels to Depsera fields. Leave empty to use defaults.
        </span>
      </div>

      {/* Metric Mappings */}
      <div className={styles.subsection}>
        <div className={styles.subsectionHeader}>
          <span className={styles.subsectionTitle}>Metric Mappings</span>
          <span className={styles.hint}>Your metric name &rarr; Depsera field</span>
        </div>
        {renderDefaults(metricDefaults)}
        <div className={styles.mappingTable}>
          {metricRows.map((row, index) => (
            <div key={index} className={styles.mappingRow}>
              <input
                type="text"
                className={styles.input}
                value={row.key}
                onChange={(e) => handleMetricKeyChange(index, e.target.value)}
                placeholder="Your metric name"
                disabled={disabled}
                aria-label={`Metric name ${index + 1}`}
              />
              <span className={styles.mappingArrow}>&rarr;</span>
              <select
                className={styles.select}
                value={row.field}
                onChange={(e) => handleMetricFieldChange(index, e.target.value)}
                disabled={disabled}
                aria-label={`Metric target field ${index + 1}`}
              >
                {METRIC_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => handleRemoveMetric(index)}
                disabled={disabled}
                aria-label={`Remove metric mapping ${index + 1}`}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className={styles.addButton}
          onClick={handleAddMetric}
          disabled={disabled}
        >
          + Add metric mapping
        </button>
      </div>

      <div className={styles.divider} />

      {/* Label Mappings */}
      <div className={styles.subsection}>
        <div className={styles.subsectionHeader}>
          <span className={styles.subsectionTitle}>Label Mappings</span>
          <span className={styles.hint}>Your label / attribute name &rarr; Depsera field</span>
        </div>
        {renderDefaults(labelDefaults)}
        <div className={styles.mappingTable}>
          {labelRows.map((row, index) => (
            <div key={index} className={styles.mappingRow}>
              <input
                type="text"
                className={styles.input}
                value={row.key}
                onChange={(e) => handleLabelKeyChange(index, e.target.value)}
                placeholder="Your label name"
                disabled={disabled}
                aria-label={`Label name ${index + 1}`}
              />
              <span className={styles.mappingArrow}>&rarr;</span>
              <select
                className={styles.select}
                value={row.field}
                onChange={(e) => handleLabelFieldChange(index, e.target.value)}
                disabled={disabled}
                aria-label={`Label target field ${index + 1}`}
              >
                {LABEL_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => handleRemoveLabel(index)}
                disabled={disabled}
                aria-label={`Remove label mapping ${index + 1}`}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className={styles.addButton}
          onClick={handleAddLabel}
          disabled={disabled}
        >
          + Add label mapping
        </button>
      </div>

      <div className={styles.divider} />

      {/* Options row: Latency Unit + Healthy Value side by side */}
      <div className={styles.optionsRow}>
        <div className={styles.optionGroup}>
          <span className={styles.optionLabel}>Latency Unit</span>
          <div className={styles.latencyUnitRow}>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="latency_unit"
                value="ms"
                checked={latencyUnit === 'ms'}
                onChange={() => handleLatencyUnitChange('ms')}
                disabled={disabled}
              />
              Milliseconds
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="latency_unit"
                value="s"
                checked={latencyUnit === 's'}
                onChange={() => handleLatencyUnitChange('s')}
                disabled={disabled}
              />
              Seconds
            </label>
          </div>
        </div>

        <div className={styles.optionGroup}>
          <span className={styles.optionLabel}>Healthy Value</span>
          <input
            type="number"
            className={styles.smallInput}
            value={healthyValue}
            onChange={(e) => handleHealthyValueChange(e.target.value)}
            placeholder="1"
            disabled={disabled}
            aria-label="Healthy value"
          />
          <span className={styles.hint}>Metric value that means healthy (default: 1)</span>
        </div>
      </div>
    </div>
  );
}

export default MetricSchemaConfigEditor;
