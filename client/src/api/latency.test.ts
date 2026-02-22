import { fetchLatencyStats, fetchLatencyBuckets } from './latency';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('fetchLatencyStats', () => {
  it('fetches latency stats for a dependency', async () => {
    const data = {
      dependencyId: 'dep-1',
      currentLatencyMs: 50,
      avgLatencyMs24h: 45,
      minLatencyMs24h: 20,
      maxLatencyMs24h: 100,
      dataPointCount: 10,
      dataPoints: [
        { latency_ms: 50, recorded_at: '2024-01-01T00:00:00Z' },
      ],
    };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchLatencyStats('dep-1');

    expect(mockFetch).toHaveBeenCalledWith('/api/latency/dep-1', { credentials: 'include' });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(fetchLatencyStats('dep-1')).rejects.toThrow('Not found');
  });
});

describe('fetchLatencyBuckets', () => {
  it('fetches latency buckets with default range', async () => {
    const data = {
      dependencyId: 'dep-1',
      range: '24h',
      buckets: [
        { timestamp: '2024-01-01T00:00:00Z', min: 10, avg: 25, max: 50, count: 5 },
      ],
    };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchLatencyBuckets('dep-1');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/latency/dep-1/buckets?range=24h',
      { credentials: 'include' }
    );
    expect(result).toEqual(data);
  });

  it('fetches latency buckets with custom range', async () => {
    const data = {
      dependencyId: 'dep-1',
      range: '7d',
      buckets: [],
    };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchLatencyBuckets('dep-1', '7d');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/latency/dep-1/buckets?range=7d',
      { credentials: 'include' }
    );
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Invalid range' }, 400));

    await expect(fetchLatencyBuckets('dep-1', '1h')).rejects.toThrow('Invalid range');
  });
});
