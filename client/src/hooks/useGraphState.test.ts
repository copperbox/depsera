import { renderHook, act } from '@testing-library/react';
import { useGraphState } from './useGraphState';
import { saveNodePositions, loadNodePositions, clearNodePositions } from './../utils/graphLayoutStorage';

// Mock dependencies
jest.mock('@xyflow/react', () => {
  const { useState, useCallback } = jest.requireActual('react');
  return {
    useNodesState: (initial: unknown[]) => {
      const [nodes, setNodes] = useState(initial);
      const onNodesChange = useCallback((changes: unknown[]) => {
        // Simple mock: just track that changes were applied
        setNodes((prev: unknown[]) => [...prev]);
        return changes;
      }, []);
      return [nodes, setNodes, onNodesChange];
    },
    useEdgesState: (initial: unknown[]) => {
      const [edges, setEdges] = useState(initial);
      const onEdgesChange = useCallback(() => {}, []);
      return [edges, setEdges, onEdgesChange];
    },
  };
});

jest.mock('../api/graph', () => ({
  fetchGraph: jest.fn().mockResolvedValue({ services: [], dependencies: [] }),
}));

jest.mock('../api/teams', () => ({
  fetchTeams: jest.fn().mockResolvedValue([]),
}));

jest.mock('../utils/graphLayout', () => ({
  LAYOUT_DIRECTION_KEY: 'graph-layout-direction',
  NODE_SPACING_KEY: 'graph-node-spacing',
  LATENCY_THRESHOLD_KEY: 'graph-latency-threshold',
  DEFAULT_NODE_SPACING: 100,
  MIN_NODE_SPACING: 50,
  MAX_NODE_SPACING: 400,
  DEFAULT_LATENCY_THRESHOLD: 50,
  MIN_LATENCY_THRESHOLD: 10,
  MAX_LATENCY_THRESHOLD: 200,
  transformGraphData: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
}));

jest.mock('../utils/graphLayoutStorage');

const mockLoadNodePositions = loadNodePositions as jest.Mock;
const mockSaveNodePositions = saveNodePositions as jest.Mock;
const mockClearNodePositions = clearNodePositions as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockLoadNodePositions.mockReturnValue({});
});

describe('useGraphState', () => {
  it('initializes without userId', () => {
    const { result } = renderHook(() => useGraphState());
    expect(result.current.nodes).toEqual([]);
    expect(result.current.edges).toEqual([]);
    expect(result.current.resetLayout).toBeDefined();
  });

  it('loads saved positions on init when userId is provided', () => {
    mockLoadNodePositions.mockReturnValue({ 'node-1': { x: 100, y: 200 } });
    renderHook(() => useGraphState({ userId: 'user-1' }));
    expect(mockLoadNodePositions).toHaveBeenCalledWith('user-1');
  });

  it('persists positions when nodes are dragged', () => {
    const { result } = renderHook(() => useGraphState({ userId: 'user-1' }));

    act(() => {
      result.current.onNodesChange([
        {
          type: 'position',
          id: 'node-1',
          dragging: false,
          position: { x: 50, y: 75 },
        } as never,
      ]);
    });

    expect(mockSaveNodePositions).toHaveBeenCalledWith('user-1', {
      'node-1': { x: 50, y: 75 },
    });
  });

  it('does not persist during active dragging', () => {
    const { result } = renderHook(() => useGraphState({ userId: 'user-1' }));

    act(() => {
      result.current.onNodesChange([
        {
          type: 'position',
          id: 'node-1',
          dragging: true,
          position: { x: 50, y: 75 },
        } as never,
      ]);
    });

    expect(mockSaveNodePositions).not.toHaveBeenCalled();
  });

  it('does not persist when no userId', () => {
    const { result } = renderHook(() => useGraphState());

    act(() => {
      result.current.onNodesChange([
        {
          type: 'position',
          id: 'node-1',
          dragging: false,
          position: { x: 50, y: 75 },
        } as never,
      ]);
    });

    expect(mockSaveNodePositions).not.toHaveBeenCalled();
  });

  it('resetLayout clears storage and reloads', async () => {
    const { result } = renderHook(() => useGraphState({ userId: 'user-1' }));

    await act(async () => {
      result.current.resetLayout();
    });

    expect(mockClearNodePositions).toHaveBeenCalledWith('user-1');
  });

  it('applies saved positions after layout', async () => {
    const { transformGraphData } = jest.requireMock('../utils/graphLayout');
    (transformGraphData as jest.Mock).mockResolvedValue({
      nodes: [
        { id: 'node-1', position: { x: 0, y: 0 }, data: {} },
        { id: 'node-2', position: { x: 100, y: 100 }, data: {} },
      ],
      edges: [],
    });

    mockLoadNodePositions.mockReturnValue({ 'node-1': { x: 50, y: 75 } });

    const { result } = renderHook(() => useGraphState({ userId: 'user-1' }));

    await act(async () => {
      await result.current.loadData();
    });

    // node-1 should have saved position, node-2 should have layout position
    const node1 = result.current.nodes.find((n) => n.id === 'node-1');
    const node2 = result.current.nodes.find((n) => n.id === 'node-2');
    expect(node1?.position).toEqual({ x: 50, y: 75 });
    expect(node2?.position).toEqual({ x: 100, y: 100 });
  });

  it('reads layout direction from localStorage', () => {
    localStorage.setItem('graph-layout-direction', 'LR');
    const { result } = renderHook(() => useGraphState());
    expect(result.current.layoutDirection).toBe('LR');
  });

  it('uses default layout direction for invalid value', () => {
    localStorage.setItem('graph-layout-direction', 'INVALID');
    const { result } = renderHook(() => useGraphState());
    expect(result.current.layoutDirection).toBe('TB');
  });

  it('reads valid node spacing from localStorage', () => {
    localStorage.setItem('graph-node-spacing', '200');
    const { result } = renderHook(() => useGraphState());
    expect(result.current.nodeSpacing).toBe(200);
  });

  it('uses default node spacing for invalid value', () => {
    localStorage.setItem('graph-node-spacing', 'invalid');
    const { result } = renderHook(() => useGraphState());
    expect(result.current.nodeSpacing).toBe(100); // DEFAULT_NODE_SPACING
  });

  it('uses default node spacing for out-of-range value', () => {
    localStorage.setItem('graph-node-spacing', '1000');
    const { result } = renderHook(() => useGraphState());
    expect(result.current.nodeSpacing).toBe(100); // DEFAULT_NODE_SPACING
  });

  it('reads valid latency threshold from localStorage', () => {
    localStorage.setItem('graph-latency-threshold', '100');
    const { result } = renderHook(() => useGraphState());
    expect(result.current.latencyThreshold).toBe(100);
  });

  it('uses default latency threshold for invalid value', () => {
    localStorage.setItem('graph-latency-threshold', 'invalid');
    const { result } = renderHook(() => useGraphState());
    expect(result.current.latencyThreshold).toBe(50); // DEFAULT_LATENCY_THRESHOLD
  });

  it('uses default latency threshold for out-of-range value', () => {
    localStorage.setItem('graph-latency-threshold', '500');
    const { result } = renderHook(() => useGraphState());
    expect(result.current.latencyThreshold).toBe(50); // DEFAULT_LATENCY_THRESHOLD
  });

  it('persists layout direction to localStorage', () => {
    const { result } = renderHook(() => useGraphState());

    act(() => {
      result.current.setLayoutDirection('LR');
    });

    expect(localStorage.getItem('graph-layout-direction')).toBe('LR');
    expect(result.current.layoutDirection).toBe('LR');
  });

  it('persists node spacing to localStorage', () => {
    const { result } = renderHook(() => useGraphState());

    act(() => {
      result.current.setNodeSpacing(250);
    });

    expect(localStorage.getItem('graph-node-spacing')).toBe('250');
    expect(result.current.nodeSpacing).toBe(250);
  });

  it('persists latency threshold to localStorage', () => {
    const { result } = renderHook(() => useGraphState());

    act(() => {
      result.current.setLatencyThreshold(75);
    });

    expect(localStorage.getItem('graph-latency-threshold')).toBe('75');
    expect(result.current.latencyThreshold).toBe(75);
  });

  it('sets error on loadData failure', async () => {
    const { fetchGraph } = jest.requireMock('../api/graph');
    (fetchGraph as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useGraphState());

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.error).toBe('Network error');
  });

  it('sets generic error for non-Error exception', async () => {
    const { fetchGraph } = jest.requireMock('../api/graph');
    (fetchGraph as jest.Mock).mockRejectedValue('String error');

    const { result } = renderHook(() => useGraphState());

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.error).toBe('Failed to load graph data');
  });

  it('resetLayout without userId does not call clearNodePositions', async () => {
    const { result } = renderHook(() => useGraphState());

    await act(async () => {
      result.current.resetLayout();
    });

    expect(mockClearNodePositions).not.toHaveBeenCalled();
  });

  it('sets search query', () => {
    const { result } = renderHook(() => useGraphState());

    act(() => {
      result.current.setSearchQuery('test query');
    });

    expect(result.current.searchQuery).toBe('test query');
  });

  it('sets selected team', () => {
    const { result } = renderHook(() => useGraphState());

    act(() => {
      result.current.setSelectedTeam('team-1');
    });

    expect(result.current.selectedTeam).toBe('team-1');
  });

  it('tracks isLoading and isRefreshing states correctly', async () => {
    const { fetchGraph } = jest.requireMock('../api/graph');
    (fetchGraph as jest.Mock).mockResolvedValue({ services: [], dependencies: [] });

    const { result } = renderHook(() => useGraphState());

    // Initial load
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await result.current.loadData(false);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isRefreshing).toBe(false);
  });

  it('sets isRefreshing for background refresh', async () => {
    const { fetchGraph } = jest.requireMock('../api/graph');
    let resolvePromise: () => void;
    const promise = new Promise<{ services: never[]; dependencies: never[] }>((resolve) => {
      resolvePromise = () => resolve({ services: [], dependencies: [] });
    });
    (fetchGraph as jest.Mock).mockReturnValue(promise);

    const { result } = renderHook(() => useGraphState());

    // Start background refresh
    let loadPromise: Promise<void>;
    act(() => {
      loadPromise = result.current.loadData(true);
    });

    // During background refresh
    expect(result.current.isRefreshing).toBe(true);

    // Complete the refresh
    await act(async () => {
      resolvePromise!();
      await loadPromise;
    });

    expect(result.current.isRefreshing).toBe(false);
  });
});
