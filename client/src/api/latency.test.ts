import { fetchLatencyStats } from './latency';

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
