import {
  fetchAliases,
  createAlias,
  updateAlias,
  deleteAlias,
  fetchCanonicalNames,
} from './aliases';

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

describe('fetchAliases', () => {
  it('fetches all aliases', async () => {
    const data = [{ id: '1', alias: 'pg-main', canonical_name: 'Primary DB' }];
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchAliases();

    expect(mockFetch).toHaveBeenCalledWith('/api/aliases', { credentials: 'include' });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Server error' }, 500));

    await expect(fetchAliases()).rejects.toThrow('Server error');
  });
});

describe('createAlias', () => {
  it('creates an alias', async () => {
    const input = { alias: 'pg-main', canonical_name: 'Primary DB' };
    const data = { id: '1', ...input, created_at: '2024-01-01' };
    mockFetch.mockResolvedValue(jsonResponse(data, 201));

    const result = await createAlias(input);

    expect(mockFetch).toHaveBeenCalledWith('/api/aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });

  it('throws on conflict', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Alias already exists' }, 409));

    await expect(createAlias({ alias: 'pg', canonical_name: 'DB' })).rejects.toThrow('Alias already exists');
  });
});

describe('updateAlias', () => {
  it('updates an alias', async () => {
    const data = { id: '1', alias: 'pg-main', canonical_name: 'New Name' };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await updateAlias('1', { canonical_name: 'New Name' });

    expect(mockFetch).toHaveBeenCalledWith('/api/aliases/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canonical_name: 'New Name' }),
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });
});

describe('deleteAlias', () => {
  it('deletes an alias', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) });

    await deleteAlias('1');

    expect(mockFetch).toHaveBeenCalledWith('/api/aliases/1', {
      method: 'DELETE',
      credentials: 'include',
    });
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(deleteAlias('1')).rejects.toThrow('Not found');
  });
});

describe('fetchCanonicalNames', () => {
  it('fetches canonical names', async () => {
    const data = ['Primary DB', 'Cache'];
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchCanonicalNames();

    expect(mockFetch).toHaveBeenCalledWith('/api/aliases/canonical-names', {
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });
});
