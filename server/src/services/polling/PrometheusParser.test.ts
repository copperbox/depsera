import { MetricSchemaConfig } from '../../db/types';
import { PrometheusParser } from './PrometheusParser';

describe('PrometheusParser', () => {
  let parser: PrometheusParser;

  beforeEach(() => {
    parser = new PrometheusParser();
  });

  it('parses a happy-path payload with all metrics', () => {
    const text = [
      '# HELP dependency_health_status Health status of dependencies',
      '# TYPE dependency_health_status gauge',
      'dependency_health_status{name="PostgreSQL",type="database",impact="critical",description="Primary database"} 0',
      'dependency_health_healthy{name="PostgreSQL"} 1',
      'dependency_health_latency_ms{name="PostgreSQL"} 12',
      'dependency_health_code{name="PostgreSQL"} 200',
    ].join('\n');

    const deps = parser.parse(text);
    expect(deps).toHaveLength(1);

    const dep = deps[0];
    expect(dep.name).toBe('PostgreSQL');
    expect(dep.healthy).toBe(true);
    expect(dep.health.state).toBe(0);
    expect(dep.health.code).toBe(200);
    expect(dep.health.latency).toBe(12);
    expect(dep.type).toBe('database');
    expect(dep.impact).toBe('critical');
    expect(dep.description).toBe('Primary database');
  });

  it('parses minimal payload (status only)', () => {
    const text = 'dependency_health_status{name="Redis"} 0\n';

    const deps = parser.parse(text);
    expect(deps).toHaveLength(1);
    expect(deps[0].name).toBe('Redis');
    expect(deps[0].healthy).toBe(true);
    expect(deps[0].health.state).toBe(0);
    expect(deps[0].health.code).toBe(200);
    expect(deps[0].health.latency).toBe(0);
    expect(deps[0].type).toBe('other');
  });

  it('warns and skips metrics with missing name label', () => {
    const text = [
      'dependency_health_status{type="database"} 0',
      'dependency_health_status{name="Redis"} 0',
    ].join('\n');

    const deps = parser.parse(text);
    expect(deps).toHaveLength(1);
    expect(deps[0].name).toBe('Redis');
    expect(parser.lastWarnings).toHaveLength(1);
    expect(parser.lastWarnings[0]).toContain('missing required "name" label');
  });

  it('parses multiple dependencies', () => {
    const text = [
      'dependency_health_status{name="PostgreSQL",type="database"} 0',
      'dependency_health_status{name="Redis",type="cache"} 2',
      'dependency_health_healthy{name="PostgreSQL"} 1',
      'dependency_health_healthy{name="Redis"} 0',
    ].join('\n');

    const deps = parser.parse(text);
    expect(deps).toHaveLength(2);

    const pg = deps.find((d) => d.name === 'PostgreSQL')!;
    const redis = deps.find((d) => d.name === 'Redis')!;

    expect(pg.healthy).toBe(true);
    expect(pg.type).toBe('database');
    expect(redis.healthy).toBe(false);
    expect(redis.type).toBe('cache');
  });

  it('uses raw latency value when unit is ms (default)', () => {
    const text = [
      'dependency_health_status{name="Redis"} 0',
      'dependency_health_latency_ms{name="Redis"} 45',
    ].join('\n');

    const deps = parser.parse(text);
    expect(deps[0].health.latency).toBe(45);
  });

  it('skips # HELP and # TYPE lines', () => {
    const text = [
      '# HELP dependency_health_status Help text',
      '# TYPE dependency_health_status gauge',
      'dependency_health_status{name="Redis"} 0',
    ].join('\n');

    const deps = parser.parse(text);
    expect(deps).toHaveLength(1);
    expect(deps[0].name).toBe('Redis');
  });

  it('skips unknown metrics silently', () => {
    const text = [
      'process_cpu_seconds_total 42.5',
      'dependency_health_status{name="Redis"} 0',
      'go_goroutines 15',
    ].join('\n');

    const deps = parser.parse(text);
    expect(deps).toHaveLength(1);
    expect(deps[0].name).toBe('Redis');
    expect(parser.lastWarnings).toHaveLength(0);
  });

  it('handles malformed lines gracefully', () => {
    const text = [
      'this is not a valid metric line !!',
      'dependency_health_status{name="Redis"} 0',
      'another bad line',
    ].join('\n');

    const deps = parser.parse(text);
    expect(deps).toHaveLength(1);
    expect(deps[0].name).toBe('Redis');
    expect(parser.lastWarnings).toHaveLength(2);
    expect(parser.lastWarnings[0]).toContain('malformed metric line');
  });

  it('handles check_skipped metric', () => {
    const text = [
      'dependency_health_status{name="Redis"} 0',
      'dependency_health_check_skipped{name="Redis"} 1',
    ].join('\n');

    const deps = parser.parse(text);
    expect(deps[0].health.skipped).toBe(true);
  });

  it('handles error_message label', () => {
    const text =
      'dependency_health_status{name="Redis",error_message="Connection refused"} 2\n';

    const deps = parser.parse(text);
    expect(deps[0].errorMessage).toBe('Connection refused');
  });

  it('throws on non-string input', () => {
    expect(() => parser.parse(42 as unknown as string)).toThrow(
      'Invalid Prometheus payload: expected string'
    );
  });

  it('returns empty array for empty input', () => {
    const deps = parser.parse('');
    expect(deps).toEqual([]);
  });

  it('returns empty array for comments-only input', () => {
    const text = [
      '# HELP some_metric Help text',
      '# TYPE some_metric gauge',
    ].join('\n');

    const deps = parser.parse(text);
    expect(deps).toEqual([]);
  });

  it('handles metrics without labels (no braces)', () => {
    // Unknown metric without labels — should be skipped silently
    const text = 'process_cpu_seconds_total 42.5\n';

    const deps = parser.parse(text);
    expect(deps).toEqual([]);
  });

  it('handles metric lines with timestamps', () => {
    const text = 'dependency_health_status{name="Redis"} 0 1768478400000\n';

    const deps = parser.parse(text);
    expect(deps).toHaveLength(1);
    expect(deps[0].name).toBe('Redis');
  });

  it('derives healthy=false when state is 2 and no healthy metric', () => {
    const text = 'dependency_health_status{name="Redis"} 2\n';

    const deps = parser.parse(text);
    expect(deps[0].healthy).toBe(false);
    expect(deps[0].health.state).toBe(2);
  });

  it('derives healthy=true when state is 1 (warning)', () => {
    const text = 'dependency_health_status{name="Redis"} 1\n';

    const deps = parser.parse(text);
    expect(deps[0].healthy).toBe(true);
    expect(deps[0].health.state).toBe(1);
  });

  it('clears warnings between parse calls', () => {
    parser.parse('bad line here');
    expect(parser.lastWarnings.length).toBeGreaterThan(0);

    parser.parse('dependency_health_status{name="Redis"} 0');
    expect(parser.lastWarnings).toHaveLength(0);
  });

  it('handles labels with escaped quotes', () => {
    const text = 'dependency_health_status{name="Redis \\"Primary\\""} 0\n';

    const deps = parser.parse(text);
    expect(deps).toHaveLength(1);
    expect(deps[0].name).toBe('Redis "Primary"');
  });

  it('handles labels with commas in values', () => {
    const text =
      'dependency_health_status{name="Redis",description="Cache, primary"} 0\n';

    const deps = parser.parse(text);
    expect(deps).toHaveLength(1);
    expect(deps[0].description).toBe('Cache, primary');
  });

  describe('custom MetricSchemaConfig', () => {
    it('should use custom metric names from config', () => {
      const config: MetricSchemaConfig = {
        metrics: { my_dep_status: 'state' },
        labels: {},
      };

      const text = 'my_dep_status{name="x"} 2\n';
      const deps = parser.parse(text, config);

      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe('x');
      expect(deps[0].health.state).toBe(2);
    });

    it('should use custom label names from config', () => {
      const config: MetricSchemaConfig = {
        metrics: {},
        labels: { dependency: 'name' },
      };

      const text = 'dependency_health_status{dependency="x"} 0\n';
      const deps = parser.parse(text, config);

      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe('x');
    });

    it('should apply latency_unit s conversion', () => {
      const config: MetricSchemaConfig = {
        metrics: {},
        labels: {},
        latency_unit: 's',
      };

      const text = [
        'dependency_health_status{name="Redis"} 0',
        'dependency_health_latency_ms{name="Redis"} 0.045',
      ].join('\n');

      const deps = parser.parse(text, config);
      expect(deps[0].health.latency).toBe(45); // 0.045s * 1000
    });

    it('should default latency_unit to ms (no conversion)', () => {
      const text = [
        'dependency_health_status{name="Redis"} 0',
        'dependency_health_latency_ms{name="Redis"} 45',
      ].join('\n');

      const deps = parser.parse(text);
      expect(deps[0].health.latency).toBe(45);
    });

    it('should merge partial overrides with defaults', () => {
      const config: MetricSchemaConfig = {
        metrics: { my_custom_state: 'state' },
        labels: {},
      };

      const text = [
        'my_custom_state{name="Redis"} 1',
        'dependency_health_healthy{name="Redis"} 1',
        'dependency_health_latency_ms{name="Redis"} 30',
      ].join('\n');

      const deps = parser.parse(text, config);
      expect(deps).toHaveLength(1);
      expect(deps[0].health.state).toBe(1);
      expect(deps[0].healthy).toBe(true);
      expect(deps[0].health.latency).toBe(30);
    });

    it('should use defaults when config has empty metrics/labels', () => {
      const config: MetricSchemaConfig = {
        metrics: {},
        labels: {},
      };

      const text = [
        'dependency_health_status{name="PostgreSQL",type="database"} 0',
        'dependency_health_healthy{name="PostgreSQL"} 1',
        'dependency_health_latency_ms{name="PostgreSQL"} 12',
      ].join('\n');

      const deps = parser.parse(text, config);
      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe('PostgreSQL');
      expect(deps[0].health.state).toBe(0);
      expect(deps[0].healthy).toBe(true);
      expect(deps[0].health.latency).toBe(12);
      expect(deps[0].type).toBe('database');
    });

    it('should use healthy_value to determine healthy status', () => {
      const config: MetricSchemaConfig = {
        metrics: { dependency_health: 'healthy' },
        labels: { dependency: 'name' },
        healthy_value: 0,
      };

      const text = [
        'dependency_health{dependency="auth-svc"} 0',
        'dependency_health{dependency="broken-svc"} 2',
      ].join('\n');

      const deps = parser.parse(text, config);
      expect(deps).toHaveLength(2);

      const auth = deps.find(d => d.name === 'auth-svc')!;
      expect(auth.healthy).toBe(true);

      const broken = deps.find(d => d.name === 'broken-svc')!;
      expect(broken.healthy).toBe(false);
    });

    it('should default healthy_value to 1 when not specified', () => {
      const text = [
        'dependency_health_healthy{name="svc"} 1',
      ].join('\n');

      const deps = parser.parse(text);
      expect(deps[0].healthy).toBe(true);
    });
  });
});
