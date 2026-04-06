import { OtlpParser } from './OtlpParser';
import { OtlpExportMetricsServiceRequest, OtlpResourceMetrics } from './otlp-types';
import { MetricSchemaConfig } from '../../db/types';

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

  describe('public method access', () => {
    it('parseResourceMetrics is callable directly', () => {
      const rm: OtlpResourceMetrics = {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'direct-svc' } }],
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
      };

      const result = parser.parseResourceMetrics(rm);
      expect(result.serviceName).toBe('direct-svc');
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].name).toBe('Redis');
    });

    it('extractServiceName is callable directly', () => {
      const rm: OtlpResourceMetrics = {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'extracted-svc' } }],
        },
        scopeMetrics: [],
      };

      expect(parser.extractServiceName(rm)).toBe('extracted-svc');
    });

    it('extractServiceName returns undefined when missing', () => {
      const rm: OtlpResourceMetrics = {
        resource: { attributes: [] },
        scopeMetrics: [],
      };

      expect(parser.extractServiceName(rm)).toBeUndefined();
    });
  });

  describe('custom MetricSchemaConfig', () => {
    /**
     * Helper to build data points with arbitrary attribute keys (not default dependency.name).
     */
    function makeCustomDataPoint(
      attrs: Record<string, string>,
      value: number,
      timeUnixNano?: string
    ) {
      const attributes = Object.entries(attrs).map(([key, val]) => ({
        key,
        value: { stringValue: val },
      }));
      return {
        attributes,
        ...(timeUnixNano && { timeUnixNano }),
        asDouble: value,
      };
    }

    function makeCustomRequest(
      serviceName: string,
      metrics: { name: string; dataPoints: ReturnType<typeof makeCustomDataPoint>[] }[]
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

    it('should use custom metric names from config', () => {
      const config: MetricSchemaConfig = {
        metrics: { 'my.health.status': 'state' },
        labels: { 'dependency.name': 'name' },
      };

      const request = makeCustomRequest('svc', [
        {
          name: 'my.health.status',
          dataPoints: [makeCustomDataPoint({ 'dependency.name': 'DB' }, 2)],
        },
      ]);

      const results = parser.parseRequest(request, config);
      expect(results[0].dependencies).toHaveLength(1);
      expect(results[0].dependencies[0].name).toBe('DB');
      expect(results[0].dependencies[0].health.state).toBe(2);
    });

    it('should use custom attribute names from config', () => {
      const config: MetricSchemaConfig = {
        metrics: {},
        labels: { 'dep.name': 'name' },
      };

      const request = makeCustomRequest('svc', [
        {
          name: 'dependency.health.status',
          dataPoints: [makeCustomDataPoint({ 'dep.name': 'Redis' }, 0)],
        },
      ]);

      const results = parser.parseRequest(request, config);
      expect(results[0].dependencies).toHaveLength(1);
      expect(results[0].dependencies[0].name).toBe('Redis');
    });

    it('should apply latency_unit s conversion', () => {
      const config: MetricSchemaConfig = {
        metrics: {},
        labels: {},
        latency_unit: 's',
      };

      const request = makeRequest('svc', [
        {
          name: 'dependency.health.status',
          dataPoints: [makeDataPoint('DB', 0)],
        },
        {
          name: 'dependency.health.latency',
          dataPoints: [makeDataPoint('DB', 1.5)],
        },
      ]);

      const results = parser.parseRequest(request, config);
      // 1.5 seconds → 1500 ms
      expect(results[0].dependencies[0].health.latency).toBe(1500);
    });

    it('should default latency_unit to ms (no conversion)', () => {
      const request = makeRequest('svc', [
        {
          name: 'dependency.health.status',
          dataPoints: [makeDataPoint('DB', 0)],
        },
        {
          name: 'dependency.health.latency',
          dataPoints: [makeDataPoint('DB', 42)],
        },
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies[0].health.latency).toBe(42);
    });

    it('should merge partial overrides with defaults', () => {
      // Override only the status metric name; other defaults should still work
      const config: MetricSchemaConfig = {
        metrics: { 'custom.status': 'state' },
        labels: {},
      };

      const request = makeCustomRequest('svc', [
        {
          name: 'custom.status',
          dataPoints: [makeCustomDataPoint({ 'dependency.name': 'DB', 'dependency.type': 'database' }, 1)],
        },
        {
          // default latency metric still works
          name: 'dependency.health.latency',
          dataPoints: [makeCustomDataPoint({ 'dependency.name': 'DB' }, 55)],
        },
      ]);

      const results = parser.parseRequest(request, config);
      const dep = results[0].dependencies[0];
      expect(dep.health.state).toBe(1);
      expect(dep.health.latency).toBe(55);
      expect(dep.type).toBe('database');
    });

    it('should pass config through parseRequest convenience method', () => {
      const config: MetricSchemaConfig = {
        metrics: { 'app.dep.state': 'state' },
        labels: { 'app.dep.name': 'name' },
      };

      const request = makeCustomRequest('svc', [
        {
          name: 'app.dep.state',
          dataPoints: [makeCustomDataPoint({ 'app.dep.name': 'Kafka' }, 0)],
        },
      ]);

      // Via parseRequest
      const viaParseRequest = parser.parseRequest(request, config);

      // Via parseResourceMetrics directly
      const viaResourceMetrics = parser.parseResourceMetrics(
        request.resourceMetrics[0],
        config
      );

      expect(viaParseRequest[0].serviceName).toBe(viaResourceMetrics.serviceName);
      expect(viaParseRequest[0].dependencies).toEqual(viaResourceMetrics.dependencies);
    });

    it('should use custom attribute key in error message when name is missing', () => {
      const config: MetricSchemaConfig = {
        metrics: {},
        labels: { 'custom.dep.name': 'name' },
      };

      const request = makeCustomRequest('svc', [
        {
          name: 'dependency.health.status',
          dataPoints: [makeCustomDataPoint({}, 0)], // no name attribute
        },
      ]);

      expect(() => parser.parseRequest(request, config)).toThrow(
        'missing required attribute: custom.dep.name'
      );
    });
  });

  describe('histogram data point processing', () => {
    function makeHistogramRequest(
      serviceName: string,
      depName: string,
      histogramData: {
        explicitBounds: number[];
        bucketCounts: string[];
        sum?: number;
        count?: string;
        min?: number;
        max?: number;
        unit?: string;
      },
    ): OtlpExportMetricsServiceRequest {
      return {
        resourceMetrics: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: serviceName } }],
            },
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: 'http.client.request.duration',
                    unit: histogramData.unit,
                    histogram: {
                      dataPoints: [
                        {
                          attributes: [
                            { key: 'dependency.name', value: { stringValue: depName } },
                            { key: 'dependency.type', value: { stringValue: 'rest' } },
                          ],
                          explicitBounds: histogramData.explicitBounds,
                          bucketCounts: histogramData.bucketCounts,
                          sum: histogramData.sum,
                          count: histogramData.count,
                          min: histogramData.min,
                          max: histogramData.max,
                          timeUnixNano: '1700000000000000000',
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
    }

    it('produces percentiles on ProactiveDepsStatus from histogram data', () => {
      const request = makeHistogramRequest('hist-svc', 'api-target', {
        explicitBounds: [0.005, 0.01, 0.025, 0.05, 0.1],
        bucketCounts: ['0', '0', '100', '0', '0', '0'],
        count: '100',
        sum: 1.75,
      });

      const results = parser.parseRequest(request);
      expect(results).toHaveLength(1);

      const dep = results[0].dependencies[0];
      expect(dep.name).toBe('api-target');
      expect(dep.health.percentiles).toBeDefined();
      expect(dep.health.percentiles!.p50).toBeDefined();
      expect(dep.health.percentiles!.p95).toBeDefined();
      expect(dep.health.percentiles!.p99).toBeDefined();
    });

    it('uses histogram avg as latency when no gauge latency is set', () => {
      const request = makeHistogramRequest('hist-svc', 'api-dep', {
        explicitBounds: [0.01, 0.025, 0.05],
        bucketCounts: ['50', '50', '0', '0'],
        count: '100',
        sum: 1.5, // avg = 0.015s = 15ms
      });

      const results = parser.parseRequest(request);
      const dep = results[0].dependencies[0];
      expect(dep.health.latency).toBe(15); // sum/count * 1000
    });

    it('reads metric unit field for auto conversion', () => {
      // Unit is 'ms' — no conversion needed
      const request = makeHistogramRequest('unit-svc', 'dep-ms', {
        explicitBounds: [10, 50, 100],
        bucketCounts: ['0', '100', '0', '0'],
        count: '100',
        sum: 3000, // avg = 30ms
        unit: 'ms',
      });

      const results = parser.parseRequest(request);
      const dep = results[0].dependencies[0];
      // With unit=ms, multiplier=1, so p50 should be in [10, 50] range
      expect(dep.health.percentiles!.p50).toBeGreaterThanOrEqual(10);
      expect(dep.health.percentiles!.p50).toBeLessThanOrEqual(50);
    });

    it('merges histogram and gauge for same dependency correctly', () => {
      const request: OtlpExportMetricsServiceRequest = {
        resourceMetrics: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'merge-svc' } }],
            },
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: 'dependency.health.status',
                    gauge: {
                      dataPoints: [
                        {
                          attributes: [
                            { key: 'dependency.name', value: { stringValue: 'postgres' } },
                            { key: 'dependency.type', value: { stringValue: 'database' } },
                          ],
                          asDouble: 0,
                          timeUnixNano: '1700000000000000000',
                        },
                      ],
                    },
                  },
                  {
                    name: 'dependency.health.healthy',
                    gauge: {
                      dataPoints: [
                        {
                          attributes: [
                            { key: 'dependency.name', value: { stringValue: 'postgres' } },
                          ],
                          asDouble: 1,
                        },
                      ],
                    },
                  },
                  {
                    name: 'db.client.operation.duration',
                    histogram: {
                      dataPoints: [
                        {
                          attributes: [
                            { key: 'dependency.name', value: { stringValue: 'postgres' } },
                          ],
                          explicitBounds: [0.01, 0.05, 0.1],
                          bucketCounts: ['80', '15', '5', '0'],
                          count: '100',
                          sum: 2.5,
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
      expect(results[0].dependencies).toHaveLength(1);
      const dep = results[0].dependencies[0];
      expect(dep.name).toBe('postgres');
      expect(dep.type).toBe('database');
      expect(dep.health.state).toBe(0);
      expect(dep.healthy).toBe(true);
      // Should have percentiles from histogram
      expect(dep.health.percentiles).toBeDefined();
      expect(dep.health.percentiles!.p50).toBeDefined();
    });
  });

  describe('sum data point processing', () => {
    it('treats non-monotonic sum as gauge value', () => {
      const request: OtlpExportMetricsServiceRequest = {
        resourceMetrics: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'sum-svc' } }],
            },
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: 'dependency.health.latency',
                    sum: {
                      dataPoints: [
                        {
                          attributes: [
                            { key: 'dependency.name', value: { stringValue: 'dep-a' } },
                          ],
                          asDouble: 42,
                          timeUnixNano: '1700000000000000000',
                        },
                      ],
                      isMonotonic: false,
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const results = parser.parseRequest(request);
      expect(results[0].dependencies).toHaveLength(1);
      const dep = results[0].dependencies[0];
      expect(dep.name).toBe('dep-a');
      expect(dep.health.latency).toBe(42);
    });

    it('stores monotonic sum as requestCount', () => {
      const request: OtlpExportMetricsServiceRequest = {
        resourceMetrics: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'counter-svc' } }],
            },
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: 'dependency.health.status',
                    gauge: {
                      dataPoints: [
                        {
                          attributes: [
                            { key: 'dependency.name', value: { stringValue: 'dep-b' } },
                          ],
                          asDouble: 0,
                          timeUnixNano: '1700000000000000000',
                        },
                      ],
                    },
                  },
                  {
                    name: 'http.client.request.count',
                    sum: {
                      dataPoints: [
                        {
                          attributes: [
                            { key: 'dependency.name', value: { stringValue: 'dep-b' } },
                          ],
                          asInt: '500',
                          timeUnixNano: '1700000000000000000',
                        },
                      ],
                      isMonotonic: true,
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const results = parser.parseRequest(request);
      expect(results[0].dependencies).toHaveLength(1);
      const dep = results[0].dependencies[0];
      expect(dep.name).toBe('dep-b');
      // requestCount should be available via percentiles
      expect(dep.health.percentiles).toBeDefined();
      expect(dep.health.percentiles!.requestCount).toBe(500);
    });
  });

  describe('existing gauge-only tests still pass', () => {
    it('parses standard gauge payload without percentiles', () => {
      const request = makeRequest('plain-svc', [
        {
          name: 'dependency.health.status',
          dataPoints: [makeDataPoint('db', 0)],
        },
        {
          name: 'dependency.health.latency',
          dataPoints: [makeDataPoint('db', 25)],
        },
      ]);

      const results = parser.parseRequest(request);
      const dep = results[0].dependencies[0];
      expect(dep.health.latency).toBe(25);
      expect(dep.health.percentiles).toBeUndefined();
    });
  });
});
