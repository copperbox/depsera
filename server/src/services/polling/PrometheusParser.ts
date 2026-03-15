import { ProactiveDepsStatus, HealthState, DependencyType } from '../../db/types';

/** Metric name → field it maps to */
const METRIC_MAP: Record<string, string> = {
  dependency_health_status: 'state',
  dependency_health_healthy: 'healthy',
  dependency_health_latency_seconds: 'latency',
  dependency_health_code: 'code',
  dependency_health_check_skipped: 'skipped',
};

/** Label name → field it maps to */
const LABEL_MAP: Record<string, string> = {
  name: 'name',
  type: 'type',
  impact: 'impact',
  description: 'description',
  error_message: 'errorMessage',
};

interface ParsedLine {
  metricName: string;
  labels: Record<string, string>;
  value: number;
}

/**
 * Parses Prometheus text exposition format into ProactiveDepsStatus arrays.
 * Extracts dependency health metrics from Prometheus-style metric lines.
 */
export class PrometheusParser {
  private _lastWarnings: string[] = [];

  get lastWarnings(): string[] {
    return this._lastWarnings;
  }

  /**
   * Parse Prometheus text exposition format.
   * @param text - Raw Prometheus metrics text
   * @returns Array of parsed dependency statuses
   */
  parse(text: string): ProactiveDepsStatus[] {
    this._lastWarnings = [];

    if (typeof text !== 'string') {
      throw new Error('Invalid Prometheus payload: expected string');
    }

    const lines = text.split('\n');
    const depMap = new Map<string, Record<string, unknown>>();

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments (# HELP, # TYPE, etc.)
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }

      const parsed = this.parseLine(trimmed);
      if (!parsed) {
        this._lastWarnings.push(`Skipping malformed metric line: ${trimmed}`);
        continue;
      }

      const field = METRIC_MAP[parsed.metricName];
      if (!field) {
        // Unknown metric — skip silently
        continue;
      }

      // Extract dependency name from labels
      const depName = parsed.labels.name;
      if (!depName) {
        this._lastWarnings.push(
          `Metric "${parsed.metricName}" missing required "name" label, skipping`
        );
        continue;
      }

      // Initialize entry if first time seeing this dependency
      if (!depMap.has(depName)) {
        const attrs: Record<string, unknown> = { name: depName };
        // Extract optional labels
        for (const [labelKey, labelValue] of Object.entries(parsed.labels)) {
          const mappedField = LABEL_MAP[labelKey];
          if (mappedField && mappedField !== 'name') {
            attrs[mappedField] = labelValue;
          }
        }
        depMap.set(depName, attrs);
      } else {
        // Merge any new labels from this line
        const entry = depMap.get(depName)!;
        for (const [labelKey, labelValue] of Object.entries(parsed.labels)) {
          const mappedField = LABEL_MAP[labelKey];
          if (mappedField && mappedField !== 'name' && entry[mappedField] === undefined) {
            entry[mappedField] = labelValue;
          }
        }
      }

      const entry = depMap.get(depName)!;
      entry[field] = parsed.value;
    }

    return Array.from(depMap.entries()).map(([name, fields]) =>
      this.buildDependency(name, fields)
    );
  }

  /**
   * Parse a single Prometheus metric line.
   * Format: metric_name{label1="value1",label2="value2"} value [timestamp]
   * or:     metric_name value [timestamp]
   */
  private parseLine(line: string): ParsedLine | null {
    // Match: metricName{labels} value OR metricName value
    const braceIndex = line.indexOf('{');

    let metricName: string;
    let labelsStr: string;
    let rest: string;

    if (braceIndex !== -1) {
      metricName = line.substring(0, braceIndex).trim();
      const closeBrace = line.indexOf('}', braceIndex);
      if (closeBrace === -1) return null;
      labelsStr = line.substring(braceIndex + 1, closeBrace);
      rest = line.substring(closeBrace + 1).trim();
    } else {
      // No labels
      const spaceIndex = line.indexOf(' ');
      if (spaceIndex === -1) return null;
      metricName = line.substring(0, spaceIndex).trim();
      labelsStr = '';
      rest = line.substring(spaceIndex + 1).trim();
    }

    if (!metricName) return null;

    // Parse the value (first token of rest, ignore optional timestamp)
    const valueStr = rest.split(/\s+/)[0];
    const value = parseFloat(valueStr);
    if (isNaN(value)) return null;

    // Parse labels
    const labels = this.parseLabels(labelsStr);

    return { metricName, labels, value };
  }

  /**
   * Parse label string: key1="value1",key2="value2"
   */
  private parseLabels(labelsStr: string): Record<string, string> {
    const labels: Record<string, string> = {};
    if (!labelsStr.trim()) return labels;

    // State machine to handle commas inside quoted values
    let key = '';
    let value = '';
    let inValue = false;
    let escaped = false;

    for (let i = 0; i < labelsStr.length; i++) {
      const ch = labelsStr[i];

      if (escaped) {
        value += ch;
        escaped = false;
        continue;
      }

      if (ch === '\\' && inValue) {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inValue = !inValue;
        continue;
      }

      if (ch === '=' && !inValue) {
        // Transition from key to value
        continue;
      }

      if (ch === ',' && !inValue) {
        // End of label pair
        if (key.trim()) {
          labels[key.trim()] = value;
        }
        key = '';
        value = '';
        continue;
      }

      if (inValue) {
        value += ch;
      } else {
        key += ch;
      }
    }

    // Last pair
    if (key.trim()) {
      labels[key.trim()] = value;
    }

    return labels;
  }

  private buildDependency(name: string, fields: Record<string, unknown>): ProactiveDepsStatus {
    const state = typeof fields.state === 'number' ? (fields.state as HealthState) : 0;
    const healthy = fields.healthy !== undefined ? fields.healthy === 1 : state !== 2;
    // Prometheus latency is in seconds — convert to milliseconds
    const latency =
      typeof fields.latency === 'number' ? Math.round(fields.latency * 1000) : 0;
    const code = typeof fields.code === 'number' ? fields.code : 200;
    const skipped = fields.skipped === 1;

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
      lastChecked: new Date().toISOString(),
      errorMessage: typeof fields.errorMessage === 'string' ? fields.errorMessage : undefined,
    };
  }
}
