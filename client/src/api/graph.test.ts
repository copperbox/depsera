import { fetchGraph } from './graph';

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

describe('fetchGraph', () => {
  const graphData = {
    nodes: [{ id: 'node-1', type: 'service', data: { name: 'Service A' } }],
    edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2', data: { relationship: 'depends_on' } }],
  };

  it('fetches graph without params', async () => {
    mockFetch.mockResolvedValue(jsonResponse(graphData));

    const result = await fetchGraph();

    expect(mockFetch).toHaveBeenCalledWith('/api/graph', { credentials: 'include' });
    expect(result).toEqual(graphData);
  });

  it('fetches graph with team filter', async () => {
    mockFetch.mockResolvedValue(jsonResponse(graphData));

    const result = await fetchGraph({ team: 'team-1' });

    expect(mockFetch).toHaveBeenCalledWith('/api/graph?team=team-1', { credentials: 'include' });
    expect(result).toEqual(graphData);
  });

  it('fetches graph with service filter', async () => {
    mockFetch.mockResolvedValue(jsonResponse(graphData));

    const result = await fetchGraph({ service: 'service-1' });

    expect(mockFetch).toHaveBeenCalledWith('/api/graph?service=service-1', { credentials: 'include' });
    expect(result).toEqual(graphData);
  });

  it('fetches graph with dependency filter', async () => {
    mockFetch.mockResolvedValue(jsonResponse(graphData));

    const result = await fetchGraph({ dependency: 'dep-1' });

    expect(mockFetch).toHaveBeenCalledWith('/api/graph?dependency=dep-1', { credentials: 'include' });
    expect(result).toEqual(graphData);
  });

  it('fetches graph with multiple filters', async () => {
    mockFetch.mockResolvedValue(jsonResponse(graphData));

    const result = await fetchGraph({ team: 'team-1', service: 'service-1', dependency: 'dep-1' });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/graph?team=team-1&service=service-1&dependency=dep-1',
      { credentials: 'include' }
    );
    expect(result).toEqual(graphData);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Server error' }, 500));

    await expect(fetchGraph()).rejects.toThrow('Server error');
  });
});
