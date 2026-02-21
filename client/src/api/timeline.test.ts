import { fetchHealthTimeline } from './timeline';

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

describe('fetchHealthTimeline', () => {
  it('fetches health timeline with default range', async () => {
    const data = {
      dependencyId: 'dep-1',
      range: '24h',
      currentState: 'healthy',
      transitions: [
        { timestamp: '2024-01-15T09:00:00Z', state: 'unhealthy' },
        { timestamp: '2024-01-15T09:05:00Z', state: 'healthy' },
      ],
    };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchHealthTimeline('dep-1');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/dependencies/dep-1/timeline?range=24h',
      { credentials: 'include' }
    );
    expect(result).toEqual(data);
  });

  it('fetches health timeline with custom range', async () => {
    const data = {
      dependencyId: 'dep-1',
      range: '7d',
      currentState: 'unhealthy',
      transitions: [],
    };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchHealthTimeline('dep-1', '7d');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/dependencies/dep-1/timeline?range=7d',
      { credentials: 'include' }
    );
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Invalid range' }, 400));

    await expect(fetchHealthTimeline('dep-1', '24h')).rejects.toThrow('Invalid range');
  });
});
