import {
  fetchServices,
  fetchService,
  createService,
  updateService,
  deleteService,
  fetchTeams,
} from './services';

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

describe('fetchServices', () => {
  it('fetches all services', async () => {
    const data = [{ id: '1', name: 'Service A' }];
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchServices();

    expect(mockFetch).toHaveBeenCalledWith('/api/services', { credentials: 'include' });
    expect(result).toEqual(data);
  });

  it('fetches services by team id', async () => {
    const data = [{ id: '1', name: 'Service A' }];
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchServices('team-1');

    expect(mockFetch).toHaveBeenCalledWith('/api/services?team_id=team-1', { credentials: 'include' });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Server error' }, 500));

    await expect(fetchServices()).rejects.toThrow('Server error');
  });
});

describe('fetchService', () => {
  it('fetches a single service', async () => {
    const data = { id: '1', name: 'Service A' };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchService('1');

    expect(mockFetch).toHaveBeenCalledWith('/api/services/1', { credentials: 'include' });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(fetchService('1')).rejects.toThrow('Not found');
  });
});

describe('createService', () => {
  it('creates a service', async () => {
    const input = { name: 'New Service', team_id: 'team-1', health_endpoint: '/health' };
    const data = { id: '1', ...input };
    mockFetch.mockResolvedValue(jsonResponse(data, 201));

    const result = await createService(input);

    expect(mockFetch).toHaveBeenCalledWith('/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Invalid input' }, 400));

    await expect(createService({ name: '', team_id: '', health_endpoint: '' })).rejects.toThrow('Invalid input');
  });
});

describe('updateService', () => {
  it('updates a service', async () => {
    const input = { name: 'Updated Service' };
    const data = { id: '1', name: 'Updated Service' };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await updateService('1', input);

    expect(mockFetch).toHaveBeenCalledWith('/api/services/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(updateService('1', { name: 'Test' })).rejects.toThrow('Not found');
  });
});

describe('deleteService', () => {
  it('deletes a service', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) });

    await deleteService('1');

    expect(mockFetch).toHaveBeenCalledWith('/api/services/1', {
      method: 'DELETE',
      credentials: 'include',
    });
  });

  it('throws on error response with message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'Service not found' }),
    });

    await expect(deleteService('1')).rejects.toThrow('Service not found');
  });

  it('throws with default message when json parse fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('Parse error')),
    });

    await expect(deleteService('1')).rejects.toThrow('Delete failed');
  });
});

describe('fetchTeams', () => {
  it('fetches teams', async () => {
    const data = [{ id: '1', name: 'Team A' }];
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchTeams();

    expect(mockFetch).toHaveBeenCalledWith('/api/teams', { credentials: 'include' });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Server error' }, 500));

    await expect(fetchTeams()).rejects.toThrow('Server error');
  });
});
