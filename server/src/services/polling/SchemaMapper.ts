import { SchemaMapping, FieldMapping, ProactiveDepsStatus, DependencyType, DEPENDENCY_TYPES } from '../../db/types';
import logger from '../../utils/logger';

/**
 * Maps custom health endpoint responses to ProactiveDepsStatus objects
 * using a SchemaMapping configuration.
 */
export class SchemaMapper {
  private schema: SchemaMapping;

  constructor(schema: SchemaMapping) {
    this.schema = schema;
  }

  /**
   * Parse a health endpoint response using the schema mapping.
   * @param data - The raw response data (object with nested structure)
   * @returns Array of parsed ProactiveDepsStatus objects
   * @throws Error if the root path doesn't resolve to an array or object
   */
  parse(data: unknown): ProactiveDepsStatus[] {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Invalid response: expected object');
    }

    const items = resolveFieldPath(data, this.schema.root);

    if (Array.isArray(items)) {
      return this.parseArray(items);
    }

    if (typeof items === 'object' && items !== null) {
      return this.parseObject(items as Record<string, unknown>);
    }

    throw new Error(
      `Schema mapping error: root path "${this.schema.root}" did not resolve to an array or object`
    );
  }

  /**
   * Parse an array of dependency items.
   */
  private parseArray(items: unknown[]): ProactiveDepsStatus[] {
    const results: ProactiveDepsStatus[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (typeof item !== 'object' || item === null) {
        logger.warn({ index: i }, 'Schema mapping: skipping non-object item at index %d', i);
        continue;
      }

      const parsed = this.parseItem(item, i);
      if (parsed) {
        results.push(parsed);
      }
    }

    return results;
  }

  /**
   * Parse an object with named keys as dependencies.
   * Each key becomes a potential dependency; the key can be used as the name
   * via the `$key` sentinel in the name field mapping.
   */
  private parseObject(obj: Record<string, unknown>): ProactiveDepsStatus[] {
    const results: ProactiveDepsStatus[] = [];
    const keys = Object.keys(obj);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = obj[key];

      if (typeof value !== 'object' || value === null) {
        logger.warn({ key }, 'Schema mapping: skipping non-object value for key "%s"', key);
        continue;
      }

      const parsed = this.parseItem(value, i, key);
      if (parsed) {
        results.push(parsed);
      }
    }

    return results;
  }

  /**
   * Check if a field mapping is the `$key` sentinel.
   */
  private isKeyMapping(mapping: FieldMapping): boolean {
    return typeof mapping === 'string' && mapping === '$key';
  }

  /**
   * Parse a single item from the checks array/object using the schema mapping.
   * Returns null if required fields are missing (logs a warning).
   * @param objectKey - When parsing an object root, the key for this item
   */
  private parseItem(item: unknown, index: number, objectKey?: string): ProactiveDepsStatus | null {
    const fields = this.schema.fields;

    // Extract required fields
    const name = this.isKeyMapping(fields.name) && objectKey !== undefined
      ? objectKey
      : this.resolveMapping(item, fields.name);
    if (typeof name !== 'string' || name.trim() === '') {
      logger.warn(
        { index },
        'Schema mapping: skipping item at index %d — "name" field is missing or not a string',
        index
      );
      return null;
    }

    const healthy = this.resolveHealthy(item, fields.healthy);
    if (healthy === null) {
      logger.warn(
        { index, name },
        'Schema mapping: skipping item "%s" at index %d — "healthy" field could not be resolved',
        name,
        index
      );
      return null;
    }

    // Extract optional fields
    const latencyRaw = fields.latency ? this.resolveMapping(item, fields.latency) : undefined;
    const latency = typeof latencyRaw === 'number' ? latencyRaw : 0;

    const impactRaw = fields.impact ? this.resolveMapping(item, fields.impact) : undefined;
    const impact = typeof impactRaw === 'string' ? impactRaw : undefined;

    const descriptionRaw = fields.description
      ? this.resolveMapping(item, fields.description)
      : undefined;
    const description = typeof descriptionRaw === 'string' ? descriptionRaw : undefined;

    return {
      name: name.trim(),
      description,
      impact,
      type: 'other' as DependencyType,
      healthy,
      health: {
        state: healthy ? 0 : 2,
        code: healthy ? 200 : 500,
        latency,
      },
      lastChecked: new Date().toISOString(),
    };
  }

  /**
   * Resolve the healthy field, handling both direct boolean mappings
   * and BooleanComparison objects.
   */
  private resolveHealthy(item: unknown, mapping: FieldMapping): boolean | null {
    if (typeof mapping === 'string') {
      const value = resolveFieldPath(item, mapping);
      if (typeof value === 'boolean') {
        return value;
      }
      // Try to coerce string values
      if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'true' || lower === 'ok' || lower === 'healthy' || lower === 'up') {
          return true;
        }
        if (lower === 'false' || lower === 'error' || lower === 'unhealthy' || lower === 'down' || lower === 'critical') {
          return false;
        }
      }
      return null;
    }

    // BooleanComparison: { field, equals }
    const value = resolveFieldPath(item, mapping.field);
    if (value === undefined || value === null) {
      return null;
    }

    return String(value).toLowerCase() === String(mapping.equals).toLowerCase();
  }

  /**
   * Resolve a field mapping to its value.
   * String mappings use dot-notation path resolution.
   * BooleanComparison mappings return boolean.
   */
  private resolveMapping(item: unknown, mapping: FieldMapping): unknown {
    if (typeof mapping === 'string') {
      return resolveFieldPath(item, mapping);
    }

    // BooleanComparison
    const value = resolveFieldPath(item, mapping.field);
    if (value === undefined || value === null) {
      return undefined;
    }
    return String(value).toLowerCase() === String(mapping.equals).toLowerCase();
  }
}

/**
 * Resolve a dot-notation field path on an object.
 * E.g., resolveFieldPath({ a: { b: { c: 1 } } }, "a.b.c") => 1
 */
export function resolveFieldPath(obj: unknown, path: string): unknown {
  if (typeof obj !== 'object' || obj === null) {
    return undefined;
  }

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}
