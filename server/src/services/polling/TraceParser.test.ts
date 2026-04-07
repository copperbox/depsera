import { TraceParser, SpanKind, SpanStatusCode } from './TraceParser';
import { OtlpExportTraceServiceRequest, OtlpResourceSpans, OtlpSpan, OtlpKeyValue } from './otlp-types';

/** Helper to build an OtlpKeyValue from a plain key/value */
function kv(key: string, value: string | number | boolean): OtlpKeyValue {
  if (typeof value === 'string') return { key, value: { stringValue: value } };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { key, value: { intValue: String(value) } }
      : { key, value: { doubleValue: value } };
  }
  return { key, value: { boolValue: value } };
}

/** Helper to build a span with defaults */
function makeSpan(overrides: Partial<OtlpSpan> & { attributes?: OtlpKeyValue[] } = {}): OtlpSpan {
  return {
    traceId: 'abc123',
    spanId: 'span1',
    name: 'test-span',
    kind: SpanKind.CLIENT,
    startTimeUnixNano: '1700000000000000000', // some timestamp
    endTimeUnixNano: '1700000000050000000',   // +50ms
    ...overrides,
  };
}

/** Helper to build a full trace request */
function makeTraceRequest(
  serviceName: string,
  spans: OtlpSpan[]
): OtlpExportTraceServiceRequest {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [kv('service.name', serviceName)],
        },
        scopeSpans: [{ spans }],
      },
    ],
  };
}

describe('TraceParser', () => {
  let parser: TraceParser;

  beforeEach(() => {
    parser = new TraceParser();
  });

  describe('parseRequest', () => {
    it('throws on non-object payload', () => {
      expect(() => parser.parseRequest(null)).toThrow('Invalid OTLP trace payload: expected object');
      expect(() => parser.parseRequest('bad')).toThrow('Invalid OTLP trace payload: expected object');
    });

    it('throws on missing resourceSpans array', () => {
      expect(() => parser.parseRequest({})).toThrow(
        'Invalid OTLP trace payload: missing resourceSpans array'
      );
    });

    it('throws on missing service.name', () => {
      const request: OtlpExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: { attributes: [] },
            scopeSpans: [{ spans: [makeSpan()] }],
          },
        ],
      };
      expect(() => parser.parseRequest(request)).toThrow(
        'OTLP trace payload missing required resource attribute: service.name'
      );
    });

    it('parses multiple resourceSpans entries', () => {
      const request: OtlpExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: { attributes: [kv('service.name', 'svc-a')] },
            scopeSpans: [
              {
                spans: [
                  makeSpan({ attributes: [kv('peer.service', 'db-a')] }),
                ],
              },
            ],
          },
          {
            resource: { attributes: [kv('service.name', 'svc-b')] },
            scopeSpans: [
              {
                spans: [
                  makeSpan({ spanId: 'span2', attributes: [kv('peer.service', 'db-b')] }),
                ],
              },
            ],
          },
        ],
      };

      const results = parser.parseRequest(request);
      expect(results).toHaveLength(2);
      expect(results[0].serviceName).toBe('svc-a');
      expect(results[0].dependencies[0].targetName).toBe('db-a');
      expect(results[1].serviceName).toBe('svc-b');
      expect(results[1].dependencies[0].targetName).toBe('db-b');
    });
  });

  describe('span kind filtering', () => {
    it('extracts dependencies from CLIENT spans', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({ kind: SpanKind.CLIENT, attributes: [kv('peer.service', 'postgres')] }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies).toHaveLength(1);
      expect(results[0].dependencies[0].targetName).toBe('postgres');
    });

    it('extracts dependencies from PRODUCER spans', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          kind: SpanKind.PRODUCER,
          attributes: [kv('messaging.system', 'kafka')],
        }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies).toHaveLength(1);
      expect(results[0].dependencies[0].targetName).toBe('kafka');
    });

    it('ignores SERVER spans for dependency discovery', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({ kind: SpanKind.SERVER, attributes: [kv('peer.service', 'caller')] }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies).toHaveLength(0);
    });

    it('ignores INTERNAL spans for dependency discovery', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({ kind: SpanKind.INTERNAL, attributes: [kv('peer.service', 'internal')] }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies).toHaveLength(0);
    });

    it('ignores CONSUMER spans for dependency discovery', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({ kind: SpanKind.CONSUMER, attributes: [kv('messaging.system', 'kafka')] }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies).toHaveLength(0);
    });

    it('ignores UNSPECIFIED kind spans', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({ kind: SpanKind.UNSPECIFIED, attributes: [kv('peer.service', 'something')] }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies).toHaveLength(0);
    });
  });

  describe('target name resolution', () => {
    it('resolves via peer.service first', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [
            kv('peer.service', 'my-database'),
            kv('db.system', 'postgresql'),
            kv('server.address', 'db.example.com'),
          ],
        }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies[0].targetName).toBe('my-database');
    });

    it('falls back to db.system', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [
            kv('db.system', 'postgresql'),
            kv('server.address', 'db.example.com'),
          ],
        }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies[0].targetName).toBe('postgresql');
    });

    it('falls back to db.system.name', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [kv('db.system.name', 'mysql')],
        }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies[0].targetName).toBe('mysql');
    });

    it('falls back to messaging.system', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          kind: SpanKind.PRODUCER,
          attributes: [kv('messaging.system', 'rabbitmq')],
        }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies[0].targetName).toBe('rabbitmq');
    });

    it('falls back to rpc.system', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [kv('rpc.system', 'grpc')],
        }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies[0].targetName).toBe('grpc');
    });

    it('falls back to rpc.system.name', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [kv('rpc.system.name', 'grpc')],
        }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies[0].targetName).toBe('grpc');
    });

    it('falls back to server.address', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [kv('server.address', 'api.example.com')],
        }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies[0].targetName).toBe('api.example.com');
    });

    it('falls back to hostname from url.full', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [kv('url.full', 'https://api.example.com/v1/users')],
        }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies[0].targetName).toBe('api.example.com');
    });

    it('warns and skips spans with no resolvable target name', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({ spanId: 'orphan', attributes: [] }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies).toHaveLength(0);
      expect(parser.lastWarnings).toHaveLength(1);
      expect(parser.lastWarnings[0]).toContain('orphan');
      expect(parser.lastWarnings[0]).toContain('no resolvable target name');
    });
  });

  describe('dependency type inference', () => {
    it('infers database from db.system', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({ attributes: [kv('db.system', 'postgresql'), kv('peer.service', 'pg')] }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.type).toBe('database');
    });

    it('infers cache for redis', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({ attributes: [kv('db.system', 'redis'), kv('peer.service', 'cache')] }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.type).toBe('cache');
    });

    it('infers cache for memcached', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({ attributes: [kv('db.system', 'memcached'), kv('peer.service', 'mc')] }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.type).toBe('cache');
    });

    it('infers message_queue from messaging.system', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          kind: SpanKind.PRODUCER,
          attributes: [kv('messaging.system', 'kafka')],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.type).toBe('message_queue');
    });

    it('infers grpc from rpc.system=grpc', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [kv('rpc.system', 'grpc'), kv('peer.service', 'user-svc')],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.type).toBe('grpc');
    });

    it('infers rest from http.request.method', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [
            kv('http.request.method', 'GET'),
            kv('server.address', 'api.example.com'),
          ],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.type).toBe('rest');
    });

    it('infers rest from legacy http.method', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [
            kv('http.method', 'POST'),
            kv('server.address', 'api.example.com'),
          ],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.type).toBe('rest');
    });

    it('defaults to other when no known system attribute', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [kv('peer.service', 'unknown-thing')],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.type).toBe('other');
    });
  });

  describe('description generation', () => {
    it('generates HTTP description with method and host/path', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [
            kv('http.request.method', 'GET'),
            kv('server.address', 'api.example.com'),
            kv('url.path', '/v1/users'),
          ],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.description).toBe('GET api.example.com/v1/users');
    });

    it('generates DB description with operation and namespace.collection', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [
            kv('db.system', 'postgresql'),
            kv('db.operation', 'SELECT'),
            kv('db.namespace', 'public'),
            kv('db.collection.name', 'users'),
            kv('peer.service', 'pg'),
          ],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.description).toBe('SELECT public.users');
    });

    it('generates messaging description with operation and destination', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          kind: SpanKind.PRODUCER,
          attributes: [
            kv('messaging.system', 'kafka'),
            kv('messaging.operation', 'publish'),
            kv('messaging.destination.name', 'orders-topic'),
          ],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.description).toBe('publish orders-topic');
    });

    it('generates gRPC description with service/method', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [
            kv('rpc.system', 'grpc'),
            kv('rpc.service', 'UserService'),
            kv('rpc.method', 'GetUser'),
            kv('peer.service', 'user-svc'),
          ],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.description).toBe('UserService/GetUser');
    });

    it('falls back to span name when no attributes match', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          name: 'custom-operation',
          attributes: [kv('peer.service', 'something')],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.description).toBe('custom-operation');
    });

    it('generates DB description falling back to db.system name', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [
            kv('db.system', 'postgresql'),
            kv('peer.service', 'pg'),
          ],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.description).toBe('postgresql');
    });
  });

  describe('latency computation', () => {
    it('computes latency from nanosecond timestamps', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          startTimeUnixNano: '1700000000000000000',
          endTimeUnixNano: '1700000000150000000', // +150ms
          attributes: [kv('peer.service', 'target')],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.latencyMs).toBe(150);
    });

    it('handles sub-millisecond durations', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          startTimeUnixNano: '1700000000000000000',
          endTimeUnixNano: '1700000000000500000', // +0.5ms → rounds to 0
          attributes: [kv('peer.service', 'target')],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.latencyMs).toBe(0);
    });

    it('returns 0 for invalid timestamps', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          startTimeUnixNano: 'not-a-number',
          endTimeUnixNano: 'also-not',
          attributes: [kv('peer.service', 'target')],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.latencyMs).toBe(0);
    });
  });

  describe('deduplication by target name', () => {
    it('deduplicates by target name with average latency', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          spanId: 'span1',
          startTimeUnixNano: '1700000000000000000',
          endTimeUnixNano: '1700000000100000000', // 100ms
          attributes: [kv('peer.service', 'postgres')],
        }),
        makeSpan({
          spanId: 'span2',
          startTimeUnixNano: '1700000000000000000',
          endTimeUnixNano: '1700000000200000000', // 200ms
          attributes: [kv('peer.service', 'postgres')],
        }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies).toHaveLength(1);
      expect(results[0].dependencies[0].targetName).toBe('postgres');
      expect(results[0].dependencies[0].latencyMs).toBe(150); // avg of 100 and 200
    });

    it('deduplicates with any-error-wins', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          spanId: 'span1',
          attributes: [kv('peer.service', 'postgres')],
          status: { code: SpanStatusCode.OK },
        }),
        makeSpan({
          spanId: 'span2',
          attributes: [kv('peer.service', 'postgres')],
          status: { code: SpanStatusCode.ERROR, message: 'connection refused' },
        }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies).toHaveLength(1);
      expect(results[0].dependencies[0].isError).toBe(true);
    });

    it('keeps distinct targets as separate dependencies', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          spanId: 'span1',
          attributes: [kv('peer.service', 'postgres')],
        }),
        makeSpan({
          spanId: 'span2',
          attributes: [kv('peer.service', 'redis')],
        }),
      ]);

      const results = parser.parseRequest(request);
      expect(results[0].dependencies).toHaveLength(2);
      const names = results[0].dependencies.map((d) => d.targetName).sort();
      expect(names).toEqual(['postgres', 'redis']);
    });
  });

  describe('error detection', () => {
    it('maps status code ERROR to isError=true', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [kv('peer.service', 'target')],
          status: { code: SpanStatusCode.ERROR },
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.isError).toBe(true);
    });

    it('maps status code OK to isError=false', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [kv('peer.service', 'target')],
          status: { code: SpanStatusCode.OK },
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.isError).toBe(false);
    });

    it('maps status code UNSET to isError=false', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [kv('peer.service', 'target')],
          status: { code: SpanStatusCode.UNSET },
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.isError).toBe(false);
    });

    it('maps missing status to isError=false', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [kv('peer.service', 'target')],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.isError).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty scopeSpans', () => {
      const request: OtlpExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: { attributes: [kv('service.name', 'svc')] },
            scopeSpans: [],
          },
        ],
      };

      const results = parser.parseRequest(request);
      expect(results[0].dependencies).toEqual([]);
    });

    it('handles empty spans array', () => {
      const request: OtlpExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: { attributes: [kv('service.name', 'svc')] },
            scopeSpans: [{ spans: [] }],
          },
        ],
      };

      const results = parser.parseRequest(request);
      expect(results[0].dependencies).toEqual([]);
    });

    it('handles multiple scopeSpans within one resource', () => {
      const request: OtlpExportTraceServiceRequest = {
        resourceSpans: [
          {
            resource: { attributes: [kv('service.name', 'svc')] },
            scopeSpans: [
              { spans: [makeSpan({ spanId: 's1', attributes: [kv('peer.service', 'db-a')] })] },
              { spans: [makeSpan({ spanId: 's2', attributes: [kv('peer.service', 'db-b')] })] },
            ],
          },
        ],
      };

      const results = parser.parseRequest(request);
      expect(results[0].dependencies).toHaveLength(2);
    });

    it('resets warnings between calls', () => {
      // First call with unresolvable span
      const req1 = makeTraceRequest('svc', [makeSpan({ attributes: [] })]);
      parser.parseRequest(req1);
      expect(parser.lastWarnings.length).toBeGreaterThan(0);

      // Second call — warnings reset
      const req2 = makeTraceRequest('svc', [
        makeSpan({ attributes: [kv('peer.service', 'ok')] }),
      ]);
      parser.parseRequest(req2);
      expect(parser.lastWarnings).toHaveLength(0);
    });

    it('extractServiceName returns undefined when no resource attributes', () => {
      const rs: OtlpResourceSpans = {
        resource: {},
        scopeSpans: [],
      };
      expect(parser.extractServiceName(rs)).toBeUndefined();
    });

    it('parseResourceSpans is callable directly', () => {
      const rs: OtlpResourceSpans = {
        resource: { attributes: [kv('service.name', 'direct-svc')] },
        scopeSpans: [
          { spans: [makeSpan({ attributes: [kv('peer.service', 'target')] })] },
        ],
      };

      const result = parser.parseResourceSpans(rs);
      expect(result.serviceName).toBe('direct-svc');
      expect(result.dependencies).toHaveLength(1);
    });

    it('captures span attributes on the dependency', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [
            kv('peer.service', 'postgres'),
            kv('db.system', 'postgresql'),
            kv('db.operation', 'SELECT'),
          ],
        }),
      ]);

      const dep = parser.parseRequest(request)[0].dependencies[0];
      expect(dep.attributes['peer.service']).toBe('postgres');
      expect(dep.attributes['db.system']).toBe('postgresql');
      expect(dep.attributes['db.operation']).toBe('SELECT');
    });

    it('handles invalid url.full gracefully', () => {
      const request = makeTraceRequest('my-svc', [
        makeSpan({
          attributes: [kv('url.full', 'not-a-valid-url')],
        }),
      ]);

      const results = parser.parseRequest(request);
      // Can't resolve target — generates warning
      expect(results[0].dependencies).toHaveLength(0);
      expect(parser.lastWarnings).toHaveLength(1);
    });
  });
});
