import { OtlpParser } from './OtlpParser';
import { OtlpExportMetricsServiceRequest } from './otlp-types';

function makeDataPoint(
  depName: string,
  value: number,
  extraAttrs: Record<string, string> = {},
  timeUnixNano?: string
) {
  const attributes = [
    { key: 'dependency.name', value: { stringValue: depName } },
    ...Object.entries(extraAttrs).map(([key, val]) => ({
      key,
      value: { stringValue: val },
    })),
  ];
  return {
    attributes,
    ...(timeUnixNano && { timeUnixNano }),
    asDouble: value,
  };
}

function makeRequest(
  serviceName: string,
  metrics: { name: string; dataPoints: ReturnType<typeof makeDataPoint>[] }[]
): OtlpExportMetricsServiceRequest {
  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: serviceName } }],
        },
        scopeMetrics: [
          {
            metrics: metrics.map((m) => ({
              name: m.name,
              gauge: { dataPoints: m.dataPoints },
            })),
          },
        ],
      },
    ],
  };
}

describe('OtlpParser', () => {
  let parser: OtlpParser;

  beforeEach(() => {
    parser = new OtlpParser();
  });

  it('parses a happy-path payload with all metrics', () => {
    const request = makeRequest('my-service', [
      {
        name: 'dependency.health.status',
        dataPoints: [
          makeDataPoint('PostgreSQL', 0, {
            'dependency.type': 'database',
            'dependency.impact': 'critical',
            'dependency.description': 'Primary database',
          }),
        ],
      },
      {
        name: 'dependency.health.healthy',
        dataPoints: [makeDataPoint('PostgreSQL', 1)],
      },
      {
        name: 'dependency.health.latency',
        dataPoints: [makeDataPoint('PostgreSQL', 12)],
      },
      {
        name: 'dependency.health.code',
        dataPoints: [makeDataPoint('PostgreSQL', 200)],
      },
    ]);

    const results = parser.parseRequest(request);
    expect(results).toHaveLength(1);
    expect(results[0].serviceName).toBe('my-service');
    expect(results[0].dependencies).toHaveLength(1);

    const dep = results[0].dependencies[0];
    expect(dep.name).toBe('PostgreSQL');
    expect(dep.healthy).toBe(true);
    expect(dep.health.state).toBe(0);
    expect(dep.health.code).toBe(200);
    expect(dep.health.latency).toBe(12);
    expect(dep.type).toBe('database');
    expect(dep.impact).toBe('critical');
    expect(dep.description).toBe('Primary database');
  });

  it('parses minimal payload with just status', () => {
    const request = makeRequest('my-service', [
      {
        name: 'dependency.health.status',
        dataPoints: [makeDataPoint('Redis', 0)],
      },
    ]);

    const results = parser.parseRequest(request);
    const dep = results[0].dependencies[0];
    expect(dep.name).toBe('Redis');
    expect(dep.healthy).toBe(true);
    expect(dep.health.state).toBe(0);
    expect(dep.health.code).toBe(200);
    expect(dep.health.latency).toBe(0);
    expect(dep.type).toBe('other');
  });

  it('throws on missing service.name', () => {
    const request: OtlpExportMetricsServiceRequest = {
      resourceMetrics: [
        {
          resource: { attributes: [] },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'dependency.health.status',
                  gauge: { dataPoints: [makeDataPoint('Redis', 0)] },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(() => parser.parseRequest(request)).toThrow(
      'OTLP payload missing required resource attribute: service.name'
    );
  });

  it('throws on missing dependency.name attribute', () => {
    const request: OtlpExportMetricsServiceRequest = {
      resourceMetrics: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'svc' } }],
          },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'dependency.health.status',
                  gauge: {
                    dataPoints: [
                      {
                        attributes: [],
                        asDouble: 0,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(() => parser.parseRequest(request)).toThrow(
      'missing required attribute: dependency.name'
    );
  });

  it('groups multiple dependencies correctly', () => {
    const request = makeRequest('my-service', [
      {
        name: 'dependency.health.status',
        dataPoints: [
          makeDataPoint('PostgreSQL', 0, { 'dependency.type': 'database' }),
          makeDataPoint('Redis', 2, { 'dependency.type': 'cache' }),
        ],
      },
      {
        name: 'dependency.health.healthy',
        dataPoints: [
          makeDataPoint('PostgreSQL', 1),
          makeDataPoint('Redis', 0),
        ],
      },
    ]);

    const results = parser.parseRequest(request);
    expect(results[0].dependencies).toHaveLength(2);

    const pg = results[0].dependencies.find((d) => d.name === 'PostgreSQL')!;
    const redis = results[0].dependencies.find((d) => d.name === 'Redis')!;

    expect(pg.healthy).toBe(true);
    expect(pg.health.state).toBe(0);
    expect(pg.type).toBe('database');

    expect(redis.healthy).toBe(false);
    expect(redis.health.state).toBe(2);
    expect(redis.type).toBe('cache');
  });

  it('ignores unknown metrics', () => {
    const request = makeRequest('my-service', [
      {
        name: 'dependency.health.status',
        dataPoints: [makeDataPoint('Redis', 0)],
      },
      {
        name: 'some.unknown.metric',
        dataPoints: [makeDataPoint('Redis', 42)],
      },
    ]);

    const results = parser.parseRequest(request);
    expect(results[0].dependencies).toHaveLength(1);
    expect(results[0].dependencies[0].name).toBe('Redis');
  });

  it('converts timeUnixNano to ISO string', () => {
    // 2026-01-15T12:00:00.000Z in nanoseconds
    const nanos = '1768478400000000000';
    const request = makeRequest('my-service', [
      {
        name: 'dependency.health.status',
        dataPoints: [makeDataPoint('Redis', 0, {}, nanos)],
      },
    ]);

    const results = parser.parseRequest(request);
    const dep = results[0].dependencies[0];
    expect(dep.lastChecked).toBe(new Date(1768478400000).toISOString());
  });

  it('falls back to Date.now() when no timeUnixNano', () => {
    const before = Date.now();
    const request = makeRequest('my-service', [
      {
        name: 'dependency.health.status',
        dataPoints: [makeDataPoint('Redis', 0)],
      },
    ]);

    const results = parser.parseRequest(request);
    const dep = results[0].dependencies[0];
    const parsed = new Date(dep.lastChecked).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(Date.now());
  });

  it('handles check_skipped metric', () => {
    const request = makeRequest('my-service', [
      {
        name: 'dependency.health.status',
        dataPoints: [makeDataPoint('Redis', 0)],
      },
      {
        name: 'dependency.health.check_skipped',
        dataPoints: [makeDataPoint('Redis', 1)],
      },
    ]);

    const results = parser.parseRequest(request);
    expect(results[0].dependencies[0].health.skipped).toBe(true);
  });

  it('handles error_message attribute', () => {
    const request = makeRequest('my-service', [
      {
        name: 'dependency.health.status',
        dataPoints: [
          makeDataPoint('Redis', 2, {
            'dependency.error_message': 'Connection refused',
          }),
        ],
      },
    ]);

    const results = parser.parseRequest(request);
    expect(results[0].dependencies[0].errorMessage).toBe('Connection refused');
  });

  it('throws on invalid payload (non-object)', () => {
    expect(() => parser.parseRequest(null)).toThrow('Invalid OTLP payload: expected object');
    expect(() => parser.parseRequest('bad')).toThrow('Invalid OTLP payload: expected object');
  });

  it('throws on missing resourceMetrics array', () => {
    expect(() => parser.parseRequest({})).toThrow(
      'Invalid OTLP payload: missing resourceMetrics array'
    );
  });

  it('handles asInt data point values', () => {
    const request: OtlpExportMetricsServiceRequest = {
      resourceMetrics: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'svc' } }],
          },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'dependency.health.code',
                  gauge: {
                    dataPoints: [
                      {
                        attributes: [
                          { key: 'dependency.name', value: { stringValue: 'DB' } },
                        ],
                        asInt: '500',
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const results = parser.parseRequest(request);
    expect(results[0].dependencies[0].health.code).toBe(500);
  });

  it('returns empty lastWarnings on success', () => {
    const request = makeRequest('my-service', [
      {
        name: 'dependency.health.status',
        dataPoints: [makeDataPoint('Redis', 0)],
      },
    ]);

    parser.parseRequest(request);
    expect(parser.lastWarnings).toEqual([]);
  });

  it('handles multiple resourceMetrics entries', () => {
    const request: OtlpExportMetricsServiceRequest = {
      resourceMetrics: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'svc-a' } }],
          },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'dependency.health.status',
                  gauge: { dataPoints: [makeDataPoint('Redis', 0)] },
                },
              ],
            },
          ],
        },
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'svc-b' } }],
          },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'dependency.health.status',
                  gauge: { dataPoints: [makeDataPoint('Kafka', 2)] },
                },
              ],
            },
          ],
        },
      ],
    };

    const results = parser.parseRequest(request);
    expect(results).toHaveLength(2);
    expect(results[0].serviceName).toBe('svc-a');
    expect(results[0].dependencies[0].name).toBe('Redis');
    expect(results[1].serviceName).toBe('svc-b');
    expect(results[1].dependencies[0].name).toBe('Kafka');
  });

  it('derives healthy=false when state is 2 and no healthy metric', () => {
    const request = makeRequest('my-service', [
      {
        name: 'dependency.health.status',
        dataPoints: [makeDataPoint('Redis', 2)],
      },
    ]);

    const results = parser.parseRequest(request);
    expect(results[0].dependencies[0].healthy).toBe(false);
  });

  it('handles empty scopeMetrics', () => {
    const request: OtlpExportMetricsServiceRequest = {
      resourceMetrics: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'svc' } }],
          },
          scopeMetrics: [],
        },
      ],
    };

    const results = parser.parseRequest(request);
    expect(results[0].dependencies).toEqual([]);
  });
});
