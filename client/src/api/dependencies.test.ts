import { updateDependencyOverrides, clearDependencyOverrides } from './dependencies';

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

describe('updateDependencyOverrides', () => {
  it('sends PUT request with contact and impact overrides', async () => {
    const updated = { id: 'd1', contact_override: '{"email":"test@co.com"}', impact_override: 'Critical' };
    mockFetch.mockResolvedValue(jsonResponse(updated));

    const result = await updateDependencyOverrides('d1', {
      contact_override: { email: 'test@co.com' },
      impact_override: 'Critical',
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/dependencies/d1/overrides', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf-token' },
      body: JSON.stringify({ contact_override: { email: 'test@co.com' }, impact_override: 'Critical' }),
      credentials: 'include',
    });
    expect(result).toEqual(updated);
  });

  it('sends PUT with only impact_override', async () => {
    const updated = { id: 'd1', impact_override: 'High' };
    mockFetch.mockResolvedValue(jsonResponse(updated));

    const result = await updateDependencyOverrides('d1', { impact_override: 'High' });

    expect(result).toEqual(updated);
  });

  it('sends PUT with null contact_override to clear it', async () => {
    const updated = { id: 'd1', contact_override: null };
    mockFetch.mockResolvedValue(jsonResponse(updated));

    const result = await updateDependencyOverrides('d1', { contact_override: null, impact_override: 'Keep this' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contact_override).toBeNull();
    expect(result).toEqual(updated);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(updateDependencyOverrides('d1', { impact_override: 'test' })).rejects.toThrow('Not found');
  });
});

describe('clearDependencyOverrides', () => {
  it('sends DELETE request', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) });

    await clearDependencyOverrides('d1');

    expect(mockFetch).toHaveBeenCalledWith('/api/dependencies/d1/overrides', {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': 'test-csrf-token' },
      credentials: 'include',
    });
  });

  it('throws on error response with message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: 'Forbidden' }),
    });

    await expect(clearDependencyOverrides('d1')).rejects.toThrow('Forbidden');
  });

  it('throws with default message when json parse fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('Parse error')),
    });

    await expect(clearDependencyOverrides('d1')).rejects.toThrow('Failed to clear overrides');
  });
});
