import {
  fetchAssociations,
  createAssociation,
  deleteAssociation,
} from './associations';

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

describe('fetchAssociations', () => {
  it('fetches associations for a dependency', async () => {
    const data = [{ id: 'a1', dependency_id: 'd1' }];
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchAssociations('d1');

    expect(mockFetch).toHaveBeenCalledWith('/api/dependencies/d1/associations', {
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(fetchAssociations('d1')).rejects.toThrow('Not found');
  });
});

describe('createAssociation', () => {
  it('creates an association', async () => {
    const input = { linked_service_id: 's1', association_type: 'api_call' as const };
    const data = { id: 'a1', ...input };
    mockFetch.mockResolvedValue(jsonResponse(data, 201));

    const result = await createAssociation('d1', input);

    expect(mockFetch).toHaveBeenCalledWith('/api/dependencies/d1/associations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf-token' },
      body: JSON.stringify(input),
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });
});

describe('deleteAssociation', () => {
  it('deletes an association', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) });

    await deleteAssociation('d1', 's1');

    expect(mockFetch).toHaveBeenCalledWith('/api/dependencies/d1/associations/s1', {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': 'test-csrf-token' },
      credentials: 'include',
    });
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Failed' }, 500));

    await expect(deleteAssociation('d1', 's1')).rejects.toThrow('Failed');
  });
});
