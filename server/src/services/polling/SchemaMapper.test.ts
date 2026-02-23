import { SchemaMapper, resolveFieldPath } from './SchemaMapper';
import { SchemaMapping } from '../../db/types';

// Suppress logger output during tests
jest.mock('../../utils/logger', () => ({
  default: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  __esModule: true,
}));

import logger from '../../utils/logger';

describe('resolveFieldPath', () => {
  it('should resolve a simple field', () => {
    expect(resolveFieldPath({ name: 'test' }, 'name')).toBe('test');
  });

  it('should resolve a nested field', () => {
    expect(resolveFieldPath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });

  it('should return undefined for missing path', () => {
    expect(resolveFieldPath({ a: 1 }, 'b')).toBeUndefined();
  });

  it('should return undefined for path through non-object', () => {
    expect(resolveFieldPath({ a: 'string' }, 'a.b')).toBeUndefined();
  });

  it('should return undefined for null input', () => {
    expect(resolveFieldPath(null, 'a')).toBeUndefined();
  });

  it('should return undefined for non-object input', () => {
    expect(resolveFieldPath('string', 'a')).toBeUndefined();
  });

  it('should resolve array values', () => {
    expect(resolveFieldPath({ items: [1, 2, 3] }, 'items')).toEqual([1, 2, 3]);
  });
});

describe('SchemaMapper', () => {
  const baseSchema: SchemaMapping = {
    root: 'data.checks',
    fields: {
      name: 'checkName',
      healthy: { field: 'status', equals: 'ok' },
    },
  };

  describe('parse', () => {
    it('should throw on non-object input', () => {
      const mapper = new SchemaMapper(baseSchema);
      expect(() => mapper.parse('string')).toThrow('Invalid response: expected object');
      expect(() => mapper.parse(null)).toThrow('Invalid response: expected object');
      expect(() => mapper.parse(42)).toThrow('Invalid response: expected object');
    });

    it('should throw when root path does not resolve to an array', () => {
      const mapper = new SchemaMapper(baseSchema);
      expect(() => mapper.parse({ data: { checks: 'not-an-array' } })).toThrow(
        'root path "data.checks" did not resolve to an array'
      );
    });

    it('should throw when root path does not exist', () => {
      const mapper = new SchemaMapper(baseSchema);
      expect(() => mapper.parse({ something: 'else' })).toThrow(
        'root path "data.checks" did not resolve to an array'
      );
    });

    it('should parse items with BooleanComparison healthy field', () => {
      const mapper = new SchemaMapper(baseSchema);
      const data = {
        data: {
          checks: [
            { checkName: 'db-primary', status: 'ok' },
            { checkName: 'cache-redis', status: 'error' },
          ],
        },
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('db-primary');
      expect(result[0].healthy).toBe(true);
      expect(result[0].health.state).toBe(0);
      expect(result[1].name).toBe('cache-redis');
      expect(result[1].healthy).toBe(false);
      expect(result[1].health.state).toBe(2);
    });

    it('should parse items with direct boolean healthy field', () => {
      const schema: SchemaMapping = {
        root: 'services',
        fields: {
          name: 'serviceName',
          healthy: 'isHealthy',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        services: [
          { serviceName: 'api', isHealthy: true },
          { serviceName: 'db', isHealthy: false },
        ],
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('api');
      expect(result[0].healthy).toBe(true);
      expect(result[1].name).toBe('db');
      expect(result[1].healthy).toBe(false);
    });

    it('should parse items with string healthy field coercion', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'state',
        },
      };
      const mapper = new SchemaMapper(schema);

      const data = {
        checks: [
          { name: 'svc-ok', state: 'ok' },
          { name: 'svc-healthy', state: 'healthy' },
          { name: 'svc-up', state: 'UP' },
          { name: 'svc-true', state: 'true' },
          { name: 'svc-error', state: 'error' },
          { name: 'svc-unhealthy', state: 'unhealthy' },
          { name: 'svc-down', state: 'down' },
          { name: 'svc-critical', state: 'critical' },
          { name: 'svc-false', state: 'false' },
        ],
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(9);
      expect(result[0].healthy).toBe(true);   // ok
      expect(result[1].healthy).toBe(true);   // healthy
      expect(result[2].healthy).toBe(true);   // UP
      expect(result[3].healthy).toBe(true);   // true
      expect(result[4].healthy).toBe(false);  // error
      expect(result[5].healthy).toBe(false);  // unhealthy
      expect(result[6].healthy).toBe(false);  // down
      expect(result[7].healthy).toBe(false);  // critical
      expect(result[8].healthy).toBe(false);  // false
    });

    it('should parse optional fields when mapped', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'checkName',
          healthy: 'isHealthy',
          latency: 'responseTimeMs',
          impact: 'severity',
          description: 'displayName',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [
          {
            checkName: 'db',
            isHealthy: true,
            responseTimeMs: 15,
            severity: 'critical',
            displayName: 'Primary Database',
          },
        ],
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('db');
      expect(result[0].healthy).toBe(true);
      expect(result[0].health.latency).toBe(15);
      expect(result[0].impact).toBe('critical');
      expect(result[0].description).toBe('Primary Database');
    });

    it('should handle nested field paths', () => {
      const schema: SchemaMapping = {
        root: 'health.dependencies',
        fields: {
          name: 'info.name',
          healthy: { field: 'info.status.current', equals: 'passing' },
          latency: 'metrics.responseTime',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        health: {
          dependencies: [
            {
              info: { name: 'postgres', status: { current: 'passing' } },
              metrics: { responseTime: 12 },
            },
            {
              info: { name: 'redis', status: { current: 'failing' } },
              metrics: { responseTime: 500 },
            },
          ],
        },
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('postgres');
      expect(result[0].healthy).toBe(true);
      expect(result[0].health.latency).toBe(12);
      expect(result[1].name).toBe('redis');
      expect(result[1].healthy).toBe(false);
      expect(result[1].health.latency).toBe(500);
    });

    it('should handle empty checks array', () => {
      const mapper = new SchemaMapper(baseSchema);
      const data = { data: { checks: [] } };

      const result = mapper.parse(data);
      expect(result).toEqual([]);
    });

    it('should skip non-object items with warning', () => {
      const mapper = new SchemaMapper(baseSchema);
      const data = {
        data: {
          checks: [
            'not-an-object',
            { checkName: 'valid', status: 'ok' },
            null,
          ],
        },
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('valid');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should skip items with missing name field', () => {
      const mapper = new SchemaMapper(baseSchema);
      const data = {
        data: {
          checks: [
            { status: 'ok' },
            { checkName: 'valid', status: 'ok' },
          ],
        },
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('valid');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should skip items with empty name', () => {
      const mapper = new SchemaMapper(baseSchema);
      const data = {
        data: {
          checks: [
            { checkName: '  ', status: 'ok' },
            { checkName: 'valid', status: 'ok' },
          ],
        },
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('valid');
    });

    it('should skip items with unresolvable healthy field', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'nonexistent',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [
          { name: 'dep1' },
          { name: 'dep2', nonexistent: true },
        ],
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('dep2');
    });

    it('should skip items with unrecognized healthy string value', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'status',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [
          { name: 'dep1', status: 'some-unknown-value' },
          { name: 'dep2', status: 'ok' },
        ],
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('dep2');
    });

    it('should handle BooleanComparison with null field value', () => {
      const mapper = new SchemaMapper(baseSchema);
      const data = {
        data: {
          checks: [
            { checkName: 'dep1', status: null },
            { checkName: 'dep2', status: 'ok' },
          ],
        },
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('dep2');
    });

    it('should use case-insensitive comparison for BooleanComparison', () => {
      const mapper = new SchemaMapper(baseSchema);
      const data = {
        data: {
          checks: [
            { checkName: 'dep1', status: 'OK' },
            { checkName: 'dep2', status: 'Ok' },
          ],
        },
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(2);
      expect(result[0].healthy).toBe(true);
      expect(result[1].healthy).toBe(true);
    });

    it('should default latency to 0 when not mapped or non-numeric', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'ok',
          latency: 'responseTime',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [
          { name: 'dep1', ok: true, responseTime: 'not-a-number' },
          { name: 'dep2', ok: true },
        ],
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(2);
      expect(result[0].health.latency).toBe(0);
      expect(result[1].health.latency).toBe(0);
    });

    it('should default impact and description to undefined when not mapped', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'ok',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [{ name: 'dep1', ok: true }],
      };

      const result = mapper.parse(data);

      expect(result[0].impact).toBeUndefined();
      expect(result[0].description).toBeUndefined();
    });

    it('should default type to other when no type mapping is provided', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'ok',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [{ name: 'dep1', ok: true }],
      };

      const result = mapper.parse(data);
      expect(result[0].type).toBe('other');
    });

    it('should resolve type from mapping when value is a valid DependencyType', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'ok',
          type: 'category',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [
          { name: 'pg', ok: true, category: 'database' },
          { name: 'api', ok: true, category: 'rest' },
          { name: 'redis', ok: true, category: 'cache' },
        ],
      };

      const result = mapper.parse(data);
      expect(result[0].type).toBe('database');
      expect(result[1].type).toBe('rest');
      expect(result[2].type).toBe('cache');
    });

    it('should pass through arbitrary string type values', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'ok',
          type: 'category',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [
          { name: 'dep1', ok: true, category: 'redis' },
          { name: 'dep2', ok: true, category: 'kafka' },
        ],
      };

      const result = mapper.parse(data);
      expect(result[0].type).toBe('redis');
      expect(result[1].type).toBe('kafka');
    });

    it('should default type to other when mapped value is non-string or missing', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'ok',
          type: 'category',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [
          { name: 'dep1', ok: true, category: 42 },
          { name: 'dep2', ok: true },
          { name: 'dep3', ok: true, category: '  ' },
        ],
      };

      const result = mapper.parse(data);
      expect(result[0].type).toBe('other');
      expect(result[1].type).toBe('other');
      expect(result[2].type).toBe('other');
    });

    it('should set health code to 200 for healthy and 500 for unhealthy', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'ok',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [
          { name: 'healthy-dep', ok: true },
          { name: 'unhealthy-dep', ok: false },
        ],
      };

      const result = mapper.parse(data);

      expect(result[0].health.code).toBe(200);
      expect(result[1].health.code).toBe(500);
    });

    it('should trim name values', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'ok',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [{ name: '  db-primary  ', ok: true }],
      };

      const result = mapper.parse(data);
      expect(result[0].name).toBe('db-primary');
    });

    it('should set lastChecked to current time', () => {
      const before = new Date().toISOString();
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'ok',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = { checks: [{ name: 'dep', ok: true }] };

      const result = mapper.parse(data);

      expect(result[0].lastChecked).toBeDefined();
      expect(new Date(result[0].lastChecked).getTime()).toBeGreaterThanOrEqual(
        new Date(before).getTime()
      );
    });

    it('should handle a real-world Spring Boot Actuator-like response', () => {
      const schema: SchemaMapping = {
        root: 'components',
        fields: {
          name: 'name',
          healthy: { field: 'status', equals: 'UP' },
          description: 'details.description',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        status: 'UP',
        components: [
          {
            name: 'db',
            status: 'UP',
            details: { description: 'PostgreSQL 15', database: 'PostgreSQL' },
          },
          {
            name: 'diskSpace',
            status: 'UP',
            details: { description: 'Disk space check' },
          },
          {
            name: 'redis',
            status: 'DOWN',
            details: { description: 'Redis cache' },
          },
        ],
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('db');
      expect(result[0].healthy).toBe(true);
      expect(result[0].description).toBe('PostgreSQL 15');
      expect(result[2].name).toBe('redis');
      expect(result[2].healthy).toBe(false);
    });

    it('should extract checkDetails when mapped and value is an object', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'ok',
          checkDetails: 'details',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [
          {
            name: 'db',
            ok: true,
            details: { database: 'PostgreSQL', version: '15.2', validationQuery: 'isValid()' },
          },
        ],
      };

      const result = mapper.parse(data);

      expect(result[0].checkDetails).toEqual({
        database: 'PostgreSQL',
        version: '15.2',
        validationQuery: 'isValid()',
      });
    });

    it('should skip checkDetails when resolved value is not an object', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'ok',
          checkDetails: 'details',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [
          { name: 'dep1', ok: true, details: 'just-a-string' },
          { name: 'dep2', ok: true, details: 42 },
          { name: 'dep3', ok: true, details: null },
          { name: 'dep4', ok: true, details: [1, 2, 3] },
        ],
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(4);
      expect(result[0].checkDetails).toBeUndefined();
      expect(result[1].checkDetails).toBeUndefined();
      expect(result[2].checkDetails).toBeUndefined();
      expect(result[3].checkDetails).toBeUndefined();
    });

    it('should skip checkDetails when path does not exist', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'ok',
          checkDetails: 'nonexistent.path',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [{ name: 'dep1', ok: true }],
      };

      const result = mapper.parse(data);

      expect(result[0].checkDetails).toBeUndefined();
    });

    it('should not include checkDetails when not mapped', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'ok',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [{ name: 'dep1', ok: true, details: { foo: 'bar' } }],
      };

      const result = mapper.parse(data);

      expect(result[0].checkDetails).toBeUndefined();
    });

    it('should resolve nested checkDetails path', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'ok',
          checkDetails: 'meta.info',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [
          { name: 'db', ok: true, meta: { info: { type: 'postgres', port: 5432 } } },
        ],
      };

      const result = mapper.parse(data);

      expect(result[0].checkDetails).toEqual({ type: 'postgres', port: 5432 });
    });

    it('should handle impact and description with non-string values gracefully', () => {
      const schema: SchemaMapping = {
        root: 'checks',
        fields: {
          name: 'name',
          healthy: 'ok',
          impact: 'impactLevel',
          description: 'desc',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        checks: [
          { name: 'dep1', ok: true, impactLevel: 42, desc: { nested: true } },
        ],
      };

      const result = mapper.parse(data);

      expect(result[0].impact).toBeUndefined();
      expect(result[0].description).toBeUndefined();
    });

    it('should throw when root resolves to a non-array/non-object (string)', () => {
      const schema: SchemaMapping = {
        root: 'data.value',
        fields: { name: 'name', healthy: 'ok' },
      };
      const mapper = new SchemaMapper(schema);
      expect(() => mapper.parse({ data: { value: 'just-a-string' } })).toThrow(
        'did not resolve to an array or object'
      );
    });

    it('should throw when root resolves to a number', () => {
      const schema: SchemaMapping = {
        root: 'data.count',
        fields: { name: 'name', healthy: 'ok' },
      };
      const mapper = new SchemaMapper(schema);
      expect(() => mapper.parse({ data: { count: 42 } })).toThrow(
        'did not resolve to an array or object'
      );
    });

    it('should throw when root resolves to null', () => {
      const schema: SchemaMapping = {
        root: 'data.items',
        fields: { name: 'name', healthy: 'ok' },
      };
      const mapper = new SchemaMapper(schema);
      expect(() => mapper.parse({ data: { items: null } })).toThrow(
        'did not resolve to an array or object'
      );
    });
  });

  describe('parse with object-keyed root', () => {
    it('should parse Spring Boot Actuator format with $key name', () => {
      const schema: SchemaMapping = {
        root: 'components',
        fields: {
          name: '$key',
          healthy: { field: 'status', equals: 'UP' },
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        status: 'UP',
        components: {
          db: { status: 'UP', details: { database: 'PostgreSQL' } },
          redis: { status: 'UP', details: { version: '7.0.0' } },
          diskSpace: { status: 'DOWN' },
        },
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('db');
      expect(result[0].healthy).toBe(true);
      expect(result[1].name).toBe('redis');
      expect(result[1].healthy).toBe(true);
      expect(result[2].name).toBe('diskSpace');
      expect(result[2].healthy).toBe(false);
    });

    it('should parse ASP.NET Health Checks format with $key name', () => {
      const schema: SchemaMapping = {
        root: 'entries',
        fields: {
          name: '$key',
          healthy: { field: 'status', equals: 'Healthy' },
          description: 'description',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        status: 'Healthy',
        totalDuration: '00:00:00.0512345',
        entries: {
          sqlserver: {
            status: 'Healthy',
            duration: '00:00:00.0234567',
            description: 'SQL Server connection check',
          },
          redis: {
            status: 'Degraded',
            duration: '00:00:00.1500000',
            description: 'Redis connectivity',
          },
        },
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('sqlserver');
      expect(result[0].healthy).toBe(true);
      expect(result[0].description).toBe('SQL Server connection check');
      expect(result[1].name).toBe('redis');
      expect(result[1].healthy).toBe(false);
      expect(result[1].description).toBe('Redis connectivity');
    });

    it('should parse object-keyed with nested field paths in values', () => {
      const schema: SchemaMapping = {
        root: 'components',
        fields: {
          name: '$key',
          healthy: { field: 'health.status', equals: 'passing' },
          latency: 'metrics.responseTime',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        components: {
          postgres: {
            health: { status: 'passing' },
            metrics: { responseTime: 12 },
          },
          redis: {
            health: { status: 'failing' },
            metrics: { responseTime: 500 },
          },
        },
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('postgres');
      expect(result[0].healthy).toBe(true);
      expect(result[0].health.latency).toBe(12);
      expect(result[1].name).toBe('redis');
      expect(result[1].healthy).toBe(false);
      expect(result[1].health.latency).toBe(500);
    });

    it('should parse object-keyed without $key (name from value field)', () => {
      const schema: SchemaMapping = {
        root: 'components',
        fields: {
          name: 'displayName',
          healthy: 'isUp',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        components: {
          db: { displayName: 'Primary Database', isUp: true },
          cache: { displayName: 'Redis Cache', isUp: false },
        },
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Primary Database');
      expect(result[0].healthy).toBe(true);
      expect(result[1].name).toBe('Redis Cache');
      expect(result[1].healthy).toBe(false);
    });

    it('should skip non-object values in object root with warning', () => {
      const schema: SchemaMapping = {
        root: 'components',
        fields: {
          name: '$key',
          healthy: { field: 'status', equals: 'UP' },
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = {
        components: {
          db: { status: 'UP' },
          version: '1.0.0',
          count: 42,
          cache: { status: 'DOWN' },
          nullEntry: null,
        },
      };

      const result = mapper.parse(data);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('db');
      expect(result[1].name).toBe('cache');
      expect(logger.warn).toHaveBeenCalledWith(
        { key: 'version' },
        expect.stringContaining('skipping non-object value for key'),
        'version'
      );
    });

    it('should return empty array for empty object root', () => {
      const schema: SchemaMapping = {
        root: 'components',
        fields: {
          name: '$key',
          healthy: 'ok',
        },
      };
      const mapper = new SchemaMapper(schema);
      const data = { components: {} };

      const result = mapper.parse(data);
      expect(result).toEqual([]);
    });
  });
});
