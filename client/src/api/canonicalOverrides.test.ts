import {
  fetchCanonicalOverrides,
  fetchCanonicalOverride,
  upsertCanonicalOverride,
  deleteCanonicalOverride,
} from './canonicalOverrides';

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

describe('fetchCanonicalOverrides', () => {
  it('sends GET request and returns overrides list', async () => {
    const overrides = [
      { id: '1', canonical_name: 'PostgreSQL', contact_override: null, impact_override: 'Critical' },
    ];
    mockFetch.mockResolvedValue(jsonResponse(overrides));

    const result = await fetchCanonicalOverrides();

    expect(mockFetch).toHaveBeenCalledWith('/api/canonical-overrides', { credentials: 'include' });
    expect(result).toEqual(overrides);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401));

    await expect(fetchCanonicalOverrides()).rejects.toThrow('Unauthorized');
  });
});

describe('fetchCanonicalOverride', () => {
  it('sends GET request with encoded canonical name', async () => {
    const override = { id: '1', canonical_name: 'PostgreSQL Primary', contact_override: null, impact_override: 'Critical' };
    mockFetch.mockResolvedValue(jsonResponse(override));

    const result = await fetchCanonicalOverride('PostgreSQL Primary');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/canonical-overrides/PostgreSQL%20Primary',
      { credentials: 'include' }
    );
    expect(result).toEqual(override);
  });

  it('throws on 404', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(fetchCanonicalOverride('Nonexistent')).rejects.toThrow('Not found');
  });
});

describe('upsertCanonicalOverride', () => {
  it('sends PUT request with contact and impact overrides', async () => {
    const saved = {
      id: '1',
      canonical_name: 'PostgreSQL',
      contact_override: '{"email":"db@co.com"}',
      impact_override: 'Critical',
    };
    mockFetch.mockResolvedValue(jsonResponse(saved));

    const result = await upsertCanonicalOverride('PostgreSQL', {
      contact_override: { email: 'db@co.com' },
      impact_override: 'Critical',
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/canonical-overrides/PostgreSQL', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf-token' },
      body: JSON.stringify({ contact_override: { email: 'db@co.com' }, impact_override: 'Critical' }),
      credentials: 'include',
    });
    expect(result).toEqual(saved);
  });

  it('sends PUT with only impact_override', async () => {
    const saved = { id: '1', canonical_name: 'Redis', impact_override: 'High' };
    mockFetch.mockResolvedValue(jsonResponse(saved));

    const result = await upsertCanonicalOverride('Redis', { impact_override: 'High' });

    expect(result).toEqual(saved);
  });

  it('sends PUT with null contact_override to clear it', async () => {
    const saved = { id: '1', canonical_name: 'PostgreSQL', contact_override: null };
    mockFetch.mockResolvedValue(jsonResponse(saved));

    await upsertCanonicalOverride('PostgreSQL', { contact_override: null, impact_override: 'Keep' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contact_override).toBeNull();
  });

  it('encodes special characters in canonical name', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: '1', canonical_name: 'Name/Special' }));

    await upsertCanonicalOverride('Name/Special', { impact_override: 'test' });

    expect(mockFetch.mock.calls[0][0]).toBe('/api/canonical-overrides/Name%2FSpecial');
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Forbidden' }, 403));

    await expect(
      upsertCanonicalOverride('PostgreSQL', { impact_override: 'test' })
    ).rejects.toThrow('Forbidden');
  });
});

describe('deleteCanonicalOverride', () => {
  it('sends DELETE request with encoded canonical name', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) });

    await deleteCanonicalOverride('PostgreSQL Primary');

    expect(mockFetch).toHaveBeenCalledWith('/api/canonical-overrides/PostgreSQL%20Primary', {
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

    await expect(deleteCanonicalOverride('PostgreSQL')).rejects.toThrow('Forbidden');
  });

  it('throws with default message when json parse fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('Parse error')),
    });

    await expect(deleteCanonicalOverride('PostgreSQL')).rejects.toThrow(
      'Failed to delete canonical override'
    );
  });
});
