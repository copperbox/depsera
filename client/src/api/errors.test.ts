import { fetchErrorHistory } from './errors';

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

describe('fetchErrorHistory', () => {
  it('fetches error history for a dependency', async () => {
    const data = {
      dependencyId: 'dep-1',
      errorCount: 2,
      errors: [
        { error: { code: 500 }, errorMessage: 'Server error', recordedAt: '2024-01-01T00:00:00Z', isRecovery: false },
        { error: null, errorMessage: null, recordedAt: '2024-01-01T01:00:00Z', isRecovery: true },
      ],
    };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchErrorHistory('dep-1');

    expect(mockFetch).toHaveBeenCalledWith('/api/errors/dep-1', { credentials: 'include' });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(fetchErrorHistory('dep-1')).rejects.toThrow('Not found');
  });
});
