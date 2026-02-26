import { fetchServicePollHistory } from './pollHistory';

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

describe('fetchServicePollHistory', () => {
  it('fetches poll history for a service', async () => {
    const data = {
      serviceId: 'svc-1',
      errorCount: 2,
      entries: [
        { error: 'Connection timeout', recordedAt: '2024-01-01T00:00:00Z', isRecovery: false },
        { error: null, recordedAt: '2024-01-01T01:00:00Z', isRecovery: true },
      ],
    };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchServicePollHistory('svc-1');

    expect(mockFetch).toHaveBeenCalledWith('/api/services/svc-1/poll-history', { credentials: 'include' });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(fetchServicePollHistory('svc-1')).rejects.toThrow('Not found');
  });
});
