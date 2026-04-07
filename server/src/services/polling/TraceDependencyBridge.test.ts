import { TraceDependencyBridge } from './TraceDependencyBridge';
import { TraceDependency } from './TraceParser';

/** Helper to build a TraceDependency with defaults */
function makeDep(overrides: Partial<TraceDependency> = {}): TraceDependency {
  return {
    targetName: 'postgres',
    type: 'database',
    latencyMs: 50,
    isError: false,
    spanKind: 3, // CLIENT
    description: 'SELECT users',
    attributes: {},
    ...overrides,
  };
}

describe('TraceDependencyBridge', () => {
  let bridge: TraceDependencyBridge;

  beforeEach(() => {
    bridge = new TraceDependencyBridge();
  });

  describe('bridgeToDepsStatus', () => {
    it('maps isError=false to state=0 (OK) and healthy=true', () => {
      const result = bridge.bridgeToDepsStatus([makeDep({ isError: false })]);

      expect(result).toHaveLength(1);
      expect(result[0].health.state).toBe(0);
      expect(result[0].healthy).toBe(true);
    });

    it('maps isError=true to state=2 (CRITICAL) and healthy=false', () => {
      const result = bridge.bridgeToDepsStatus([makeDep({ isError: true })]);

      expect(result).toHaveLength(1);
      expect(result[0].health.state).toBe(2);
      expect(result[0].healthy).toBe(false);
    });

    it('sets health.code to 200 for non-error and 500 for error', () => {
      const ok = bridge.bridgeToDepsStatus([makeDep({ isError: false })]);
      const err = bridge.bridgeToDepsStatus([makeDep({ isError: true })]);

      expect(ok[0].health.code).toBe(200);
      expect(err[0].health.code).toBe(500);
    });

    it('sets discovery_source to otlp_trace', () => {
      const result = bridge.bridgeToDepsStatus([makeDep()]);

      expect(result[0].discovery_source).toBe('otlp_trace');
    });

    it('maps span duration to health.latency', () => {
      const result = bridge.bridgeToDepsStatus([makeDep({ latencyMs: 123 })]);

      expect(result[0].health.latency).toBe(123);
    });

    it('maps targetName to name', () => {
      const result = bridge.bridgeToDepsStatus([makeDep({ targetName: 'redis' })]);

      expect(result[0].name).toBe('redis');
    });

    it('maps type through to output', () => {
      const result = bridge.bridgeToDepsStatus([makeDep({ type: 'cache' })]);

      expect(result[0].type).toBe('cache');
    });

    it('maps description through to output', () => {
      const result = bridge.bridgeToDepsStatus([makeDep({ description: 'GET key' })]);

      expect(result[0].description).toBe('GET key');
    });

    it('sets lastChecked to current time', () => {
      const before = new Date().toISOString();
      const result = bridge.bridgeToDepsStatus([makeDep()]);
      const after = new Date().toISOString();

      expect(result[0].lastChecked >= before).toBe(true);
      expect(result[0].lastChecked <= after).toBe(true);
    });

    it('returns empty array for empty input', () => {
      const result = bridge.bridgeToDepsStatus([]);
      expect(result).toHaveLength(0);
    });

    it('converts multiple distinct dependencies', () => {
      const result = bridge.bridgeToDepsStatus([
        makeDep({ targetName: 'postgres', type: 'database', latencyMs: 10 }),
        makeDep({ targetName: 'redis', type: 'cache', latencyMs: 5 }),
        makeDep({ targetName: 'kafka', type: 'message_queue', latencyMs: 20 }),
      ]);

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.name).sort()).toEqual(['kafka', 'postgres', 'redis']);
    });

    it('groups multiple spans to same target with avg latency', () => {
      const result = bridge.bridgeToDepsStatus([
        makeDep({ targetName: 'postgres', latencyMs: 40 }),
        makeDep({ targetName: 'postgres', latencyMs: 60 }),
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('postgres');
      expect(result[0].health.latency).toBe(50); // avg of 40 and 60
    });

    it('groups multiple spans to same target with any-error-wins', () => {
      const result = bridge.bridgeToDepsStatus([
        makeDep({ targetName: 'postgres', isError: false }),
        makeDep({ targetName: 'postgres', isError: true }),
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].healthy).toBe(false);
      expect(result[0].health.state).toBe(2);
      expect(result[0].health.code).toBe(500);
    });

    it('keeps healthy=true when all grouped spans are non-error', () => {
      const result = bridge.bridgeToDepsStatus([
        makeDep({ targetName: 'redis', isError: false }),
        makeDep({ targetName: 'redis', isError: false }),
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].healthy).toBe(true);
      expect(result[0].health.state).toBe(0);
    });

    it('sets description to undefined for empty string', () => {
      const result = bridge.bridgeToDepsStatus([makeDep({ description: '' })]);

      expect(result[0].description).toBeUndefined();
    });
  });
});
