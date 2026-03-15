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
      'dependency_health_latency_seconds{name="PostgreSQL"} 0.012',
      'dependency_health_code{name="PostgreSQL"} 200',
    ].join('\n');

    const deps = parser.parse(text);
    expect(deps).toHaveLength(1);

    const dep = deps[0];
    expect(dep.name).toBe('PostgreSQL');
    expect(dep.healthy).toBe(true);
    expect(dep.health.state).toBe(0);
    expect(dep.health.code).toBe(200);
    expect(dep.health.latency).toBe(12); // 0.012s * 1000
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

  it('converts latency from seconds to milliseconds', () => {
    const text = [
      'dependency_health_status{name="Redis"} 0',
      'dependency_health_latency_seconds{name="Redis"} 0.045',
    ].join('\n');

    const deps = parser.parse(text);
    expect(deps[0].health.latency).toBe(45);
  });

  it('rounds latency to nearest millisecond', () => {
    const text = [
      'dependency_health_status{name="Redis"} 0',
      'dependency_health_latency_seconds{name="Redis"} 0.0123',
    ].join('\n');

    const deps = parser.parse(text);
    expect(deps[0].health.latency).toBe(12);
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
});
