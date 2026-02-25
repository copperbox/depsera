import { DependencyParser } from './DependencyParser';
import { SchemaMapping } from '../../db/types';

// Suppress logger output during tests (used by SchemaMapper)
jest.mock('../../utils/logger', () => ({
  default: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  __esModule: true,
}));

describe('DependencyParser', () => {
  const parser = new DependencyParser();

  describe('parse', () => {
    it('should throw on non-array input', () => {
      expect(() => parser.parse({})).toThrow('Invalid response: expected array');
      expect(() => parser.parse('string')).toThrow('Invalid response: expected array');
      expect(() => parser.parse(null)).toThrow('Invalid response: expected array');
    });

    it('should throw on invalid item type', () => {
      expect(() => parser.parse(['string'])).toThrow('expected object');
      expect(() => parser.parse([null])).toThrow('expected object');
    });

    it('should throw on missing name', () => {
      expect(() => parser.parse([{ healthy: true }])).toThrow('missing name');
    });

    it('should throw on missing healthy', () => {
      expect(() => parser.parse([{ name: 'test' }])).toThrow('missing healthy');
    });

    it('should parse minimal valid dependency', () => {
      const result = parser.parse([{ name: 'test-dep', healthy: true }]);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test-dep');
      expect(result[0].healthy).toBe(true);
      expect(result[0].type).toBe('other');
      expect(result[0].health.state).toBe(0);
      expect(result[0].health.code).toBe(200);
      expect(result[0].health.latency).toBe(0);
    });

    it('should parse nested health format', () => {
      const result = parser.parse([{
        name: 'test-dep',
        healthy: false,
        health: {
          state: 2,
          code: 500,
          latency: 150,
        },
      }]);

      expect(result[0].health.state).toBe(2);
      expect(result[0].health.code).toBe(500);
      expect(result[0].health.latency).toBe(150);
    });

    it('should parse flat health format', () => {
      const result = parser.parse([{
        name: 'test-dep',
        healthy: true,
        healthCode: 201,
        latencyMs: 75,
      }]);

      expect(result[0].health.state).toBe(0);
      expect(result[0].health.code).toBe(201);
      expect(result[0].health.latency).toBe(75);
    });

    it('should derive state from healthy in flat format', () => {
      const result = parser.parse([{
        name: 'test-dep',
        healthy: false,
        healthCode: 500,
      }]);

      expect(result[0].health.state).toBe(2);
    });

    it('should parse optional fields', () => {
      const result = parser.parse([{
        name: 'test-dep',
        healthy: true,
        description: 'Test description',
        impact: 'Critical',
        type: 'database',
        lastChecked: '2024-01-01T00:00:00Z',
      }]);

      expect(result[0].description).toBe('Test description');
      expect(result[0].impact).toBe('Critical');
      expect(result[0].type).toBe('database');
      expect(result[0].lastChecked).toBe('2024-01-01T00:00:00Z');
    });

    it('should pass through any string type value', () => {
      const validResult = parser.parse([{ name: 'db', healthy: true, type: 'database' }]);
      expect(validResult[0].type).toBe('database');

      const customResult = parser.parse([{ name: 'test', healthy: true, type: 'redis' }]);
      expect(customResult[0].type).toBe('redis');

      const missingResult = parser.parse([{ name: 'test', healthy: true }]);
      expect(missingResult[0].type).toBe('other');
    });

    it('should parse checkDetails', () => {
      const result = parser.parse([{
        name: 'test-dep',
        healthy: true,
        checkDetails: { query: 'SELECT 1', rows: 1 },
      }]);

      expect(result[0].checkDetails).toEqual({ query: 'SELECT 1', rows: 1 });
    });

    it('should parse contact when present as object', () => {
      const result = parser.parse([{
        name: 'test-dep',
        healthy: true,
        contact: { email: 'team@example.com', slack: '#db-team' },
      }]);

      expect(result[0].contact).toEqual({ email: 'team@example.com', slack: '#db-team' });
    });

    it('should return undefined contact when missing', () => {
      const result = parser.parse([{
        name: 'test-dep',
        healthy: true,
      }]);

      expect(result[0].contact).toBeUndefined();
    });

    it('should ignore contact when not an object', () => {
      const stringResult = parser.parse([{
        name: 'test-dep',
        healthy: true,
        contact: 'not-an-object',
      }]);
      expect(stringResult[0].contact).toBeUndefined();

      const numberResult = parser.parse([{
        name: 'test-dep',
        healthy: true,
        contact: 42,
      }]);
      expect(numberResult[0].contact).toBeUndefined();

      const nullResult = parser.parse([{
        name: 'test-dep',
        healthy: true,
        contact: null,
      }]);
      expect(nullResult[0].contact).toBeUndefined();

      const boolResult = parser.parse([{
        name: 'test-dep',
        healthy: true,
        contact: true,
      }]);
      expect(boolResult[0].contact).toBeUndefined();
    });

    it('should parse error fields', () => {
      const result = parser.parse([{
        name: 'test-dep',
        healthy: false,
        error: { code: 'TIMEOUT', details: 'Connection timed out' },
        errorMessage: 'Connection timed out',
      }]);

      expect(result[0].error).toEqual({ code: 'TIMEOUT', details: 'Connection timed out' });
      expect(result[0].errorMessage).toBe('Connection timed out');
    });

    it('should parse multiple dependencies', () => {
      const result = parser.parse([
        { name: 'dep1', healthy: true },
        { name: 'dep2', healthy: false },
        { name: 'dep3', healthy: true },
      ]);

      expect(result).toHaveLength(3);
      expect(result.map(d => d.name)).toEqual(['dep1', 'dep2', 'dep3']);
    });

    it('should handle empty array', () => {
      const result = parser.parse([]);
      expect(result).toEqual([]);
    });
  });

  describe('parse with SchemaMapping', () => {
    const schema: SchemaMapping = {
      root: 'data.healthChecks',
      fields: {
        name: 'checkName',
        healthy: { field: 'status', equals: 'ok' },
        latency: 'responseTimeMs',
        impact: 'severity',
        description: 'displayName',
      },
    };

    it('should delegate to SchemaMapper when schema is provided', () => {
      const data = {
        data: {
          healthChecks: [
            {
              checkName: 'postgres',
              status: 'ok',
              responseTimeMs: 12,
              severity: 'critical',
              displayName: 'Primary DB',
            },
          ],
        },
      };

      const result = parser.parse(data, schema);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('postgres');
      expect(result[0].healthy).toBe(true);
      expect(result[0].health.latency).toBe(12);
      expect(result[0].impact).toBe('critical');
      expect(result[0].description).toBe('Primary DB');
    });

    it('should use proactive-deps parser when schema is null', () => {
      const result = parser.parse([{ name: 'test', healthy: true }], null);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test');
    });

    it('should use proactive-deps parser when schema is undefined', () => {
      const result = parser.parse([{ name: 'test', healthy: true }], undefined);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test');
    });

    it('should accept non-array data when schema is provided', () => {
      const data = {
        data: {
          healthChecks: [
            { checkName: 'dep1', status: 'ok' },
          ],
        },
      };

      // With schema, non-array top-level data is fine (root path resolves to array)
      const result = parser.parse(data, schema);
      expect(result).toHaveLength(1);
    });

    it('should throw for non-array data without schema', () => {
      expect(() => parser.parse({ not: 'array' })).toThrow('expected array');
    });

    it('should parse object-keyed schema with $key name mapping', () => {
      const objectSchema: SchemaMapping = {
        root: 'components',
        fields: {
          name: '$key',
          healthy: { field: 'status', equals: 'UP' },
        },
      };

      const data = {
        status: 'UP',
        components: {
          db: { status: 'UP' },
          redis: { status: 'DOWN' },
        },
      };

      const result = parser.parse(data, objectSchema);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('db');
      expect(result[0].healthy).toBe(true);
      expect(result[1].name).toBe('redis');
      expect(result[1].healthy).toBe(false);
    });
  });
});
