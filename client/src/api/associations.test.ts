import {
  fetchAssociations,
  createAssociation,
  deleteAssociation,
  generateDependencySuggestions,
  generateServiceSuggestions,
  fetchSuggestions,
  acceptSuggestion,
  dismissSuggestion,
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

describe('generateDependencySuggestions', () => {
  it('generates suggestions for a dependency', async () => {
    const data = [{ id: 's1' }];
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await generateDependencySuggestions('d1');

    expect(mockFetch).toHaveBeenCalledWith('/api/dependencies/d1/suggestions/generate', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'test-csrf-token' },
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });
});

describe('generateServiceSuggestions', () => {
  it('generates suggestions for a service', async () => {
    const data = [{ id: 's1' }];
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await generateServiceSuggestions('svc1');

    expect(mockFetch).toHaveBeenCalledWith('/api/services/svc1/suggestions/generate', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'test-csrf-token' },
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });
});

describe('fetchSuggestions', () => {
  it('fetches all pending suggestions', async () => {
    const data = [{ id: 's1', dependency_name: 'dep' }];
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchSuggestions();

    expect(mockFetch).toHaveBeenCalledWith('/api/associations/suggestions', {
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });
});

describe('acceptSuggestion', () => {
  it('accepts a suggestion', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });

    await acceptSuggestion('s1');

    expect(mockFetch).toHaveBeenCalledWith('/api/associations/suggestions/s1/accept', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'test-csrf-token' },
      credentials: 'include',
    });
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(acceptSuggestion('s1')).rejects.toThrow('Not found');
  });
});

describe('dismissSuggestion', () => {
  it('dismisses a suggestion', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) });

    await dismissSuggestion('s1');

    expect(mockFetch).toHaveBeenCalledWith('/api/associations/suggestions/s1/dismiss', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'test-csrf-token' },
      credentials: 'include',
    });
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Failed' }, 500));

    await expect(dismissSuggestion('s1')).rejects.toThrow('Failed');
  });
});
