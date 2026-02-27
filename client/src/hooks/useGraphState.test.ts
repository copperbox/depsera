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
  EDGE_STYLE_KEY: 'graph-edge-style',
  DASHED_ANIMATION_KEY: 'graph-dashed-animation',
  PACKET_ANIMATION_KEY: 'graph-packet-animation',
  transformGraphData: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
  computeTopologyFingerprint: jest.fn().mockReturnValue(''),
  updateGraphDataOnly: jest.fn().mockReturnValue({ nodes: [], edges: [] }),
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

  it('reads valid edge style from localStorage', () => {
    localStorage.setItem('graph-edge-style', 'bezier');
    const { result } = renderHook(() => useGraphState());
    expect(result.current.edgeStyle).toBe('bezier');
  });

  it('uses default edge style for invalid value', () => {
    localStorage.setItem('graph-edge-style', 'invalid');
    const { result } = renderHook(() => useGraphState());
    expect(result.current.edgeStyle).toBe('orthogonal');
  });

  it('persists layout direction to localStorage', () => {
    const { result } = renderHook(() => useGraphState());

    act(() => {
      result.current.setLayoutDirection('LR');
    });

    expect(localStorage.getItem('graph-layout-direction')).toBe('LR');
    expect(result.current.layoutDirection).toBe('LR');
  });

  it('persists edge style to localStorage', () => {
    const { result } = renderHook(() => useGraphState());

    act(() => {
      result.current.setEdgeStyle('bezier');
    });

    expect(localStorage.getItem('graph-edge-style')).toBe('bezier');
    expect(result.current.edgeStyle).toBe('bezier');
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

  it('auto-selects source node when initialDependencyId matches an edge', async () => {
    const { transformGraphData } = jest.requireMock('../utils/graphLayout');
    const { fetchGraph } = jest.requireMock('../api/graph');
    (fetchGraph as jest.Mock).mockResolvedValue({ services: [], dependencies: [] });
    (transformGraphData as jest.Mock).mockResolvedValue({
      nodes: [
        { id: 'service-1', position: { x: 0, y: 0 }, data: { name: 'Service A' } },
        { id: 'service-2', position: { x: 100, y: 0 }, data: { name: 'Service B' } },
      ],
      edges: [
        { id: 'edge-1', source: 'service-1', target: 'service-2', data: { dependencyId: 'dep-42' } },
      ],
    });

    const { result } = renderHook(() =>
      useGraphState({ initialDependencyId: 'dep-42' })
    );

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.selectedNodeId).toBe('service-1');
    const selectedNode = result.current.nodes.find((n) => n.id === 'service-1');
    expect(selectedNode?.selected).toBe(true);
  });

  it('does not auto-select when initialDependencyId does not match any edge', async () => {
    const { transformGraphData } = jest.requireMock('../utils/graphLayout');
    const { fetchGraph } = jest.requireMock('../api/graph');
    (fetchGraph as jest.Mock).mockResolvedValue({ services: [], dependencies: [] });
    (transformGraphData as jest.Mock).mockResolvedValue({
      nodes: [
        { id: 'service-1', position: { x: 0, y: 0 }, data: { name: 'Service A' } },
      ],
      edges: [],
    });

    const { result } = renderHook(() =>
      useGraphState({ initialDependencyId: 'dep-nonexistent' })
    );

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.selectedNodeId).toBeNull();
  });

  it('only auto-selects on first load, not on subsequent loads', async () => {
    const { transformGraphData } = jest.requireMock('../utils/graphLayout');
    const { fetchGraph } = jest.requireMock('../api/graph');
    (fetchGraph as jest.Mock).mockResolvedValue({ services: [], dependencies: [] });
    (transformGraphData as jest.Mock).mockResolvedValue({
      nodes: [
        { id: 'service-1', position: { x: 0, y: 0 }, data: { name: 'Service A' } },
        { id: 'service-2', position: { x: 100, y: 0 }, data: { name: 'Service B' } },
      ],
      edges: [
        { id: 'edge-1', source: 'service-1', target: 'service-2', data: { dependencyId: 'dep-42' } },
      ],
    });

    const { result } = renderHook(() =>
      useGraphState({ initialDependencyId: 'dep-42' })
    );

    // First load — should auto-select
    await act(async () => {
      await result.current.loadData();
    });
    expect(result.current.selectedNodeId).toBe('service-1');

    // Clear selection manually
    act(() => {
      result.current.setSelectedNodeId(null);
    });

    // Second load — should NOT auto-select again
    await act(async () => {
      await result.current.loadData();
    });
    expect(result.current.selectedNodeId).toBeNull();
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

  it('skips layout and uses updateGraphDataOnly when topology is unchanged on background refresh', async () => {
    const { transformGraphData, computeTopologyFingerprint, updateGraphDataOnly } = jest.requireMock('../utils/graphLayout');
    const { fetchGraph } = jest.requireMock('../api/graph');

    const mockNodes = [
      { id: 'node-1', position: { x: 0, y: 0 }, data: { name: 'Service A' } },
      { id: 'node-2', position: { x: 100, y: 100 }, data: { name: 'Service B' } },
    ];
    const mockEdges = [
      { id: 'edge-1', source: 'node-1', target: 'node-2', data: { relationship: 'depends_on' } },
    ];

    (fetchGraph as jest.Mock).mockResolvedValue({ nodes: [], edges: [] });
    (transformGraphData as jest.Mock).mockResolvedValue({ nodes: mockNodes, edges: mockEdges });
    (computeTopologyFingerprint as jest.Mock).mockReturnValue('fingerprint-1');
    (updateGraphDataOnly as jest.Mock).mockReturnValue({
      nodes: mockNodes.map(n => ({ ...n, data: { ...n.data, updated: true } })),
      edges: mockEdges,
    });

    const { result } = renderHook(() => useGraphState());

    // First load — full layout (fingerprint not yet stored)
    await act(async () => {
      await result.current.loadData(false);
    });

    expect(transformGraphData).toHaveBeenCalledTimes(1);
    expect(updateGraphDataOnly).not.toHaveBeenCalled();

    jest.clearAllMocks();
    (fetchGraph as jest.Mock).mockResolvedValue({ nodes: [], edges: [] });
    (computeTopologyFingerprint as jest.Mock).mockReturnValue('fingerprint-1');

    // Second load — background refresh with same fingerprint
    await act(async () => {
      await result.current.loadData(true);
    });

    expect(transformGraphData).not.toHaveBeenCalled();
    expect(updateGraphDataOnly).toHaveBeenCalled();
  });

  it('does full layout when topology changes on background refresh', async () => {
    const { transformGraphData, computeTopologyFingerprint, updateGraphDataOnly } = jest.requireMock('../utils/graphLayout');
    const { fetchGraph } = jest.requireMock('../api/graph');

    const mockNodes = [
      { id: 'node-1', position: { x: 0, y: 0 }, data: { name: 'Service A' } },
    ];
    const mockEdges: never[] = [];

    (fetchGraph as jest.Mock).mockResolvedValue({ nodes: [], edges: [] });
    (transformGraphData as jest.Mock).mockResolvedValue({ nodes: mockNodes, edges: mockEdges });
    (computeTopologyFingerprint as jest.Mock).mockReturnValue('fingerprint-1');

    const { result } = renderHook(() => useGraphState());

    // First load
    await act(async () => {
      await result.current.loadData(false);
    });

    jest.clearAllMocks();
    (fetchGraph as jest.Mock).mockResolvedValue({ nodes: [], edges: [] });
    (computeTopologyFingerprint as jest.Mock).mockReturnValue('fingerprint-2'); // changed
    (transformGraphData as jest.Mock).mockResolvedValue({
      nodes: [
        ...mockNodes,
        { id: 'node-2', position: { x: 100, y: 100 }, data: { name: 'Service B' } },
      ],
      edges: [
        { id: 'edge-1', source: 'node-1', target: 'node-2', data: { relationship: 'depends_on' } },
      ],
    });

    // Background refresh with different fingerprint
    await act(async () => {
      await result.current.loadData(true);
    });

    expect(transformGraphData).toHaveBeenCalled();
    expect(updateGraphDataOnly).not.toHaveBeenCalled();
  });

  describe('animation toggles', () => {
    it('defaults dashedAnimation to false', () => {
      const { result } = renderHook(() => useGraphState());
      expect(result.current.dashedAnimation).toBe(false);
    });

    it('defaults packetAnimation to true', () => {
      const { result } = renderHook(() => useGraphState());
      expect(result.current.packetAnimation).toBe(true);
    });

    it('reads dashedAnimation from localStorage', () => {
      localStorage.setItem('graph-dashed-animation', 'true');
      const { result } = renderHook(() => useGraphState());
      expect(result.current.dashedAnimation).toBe(true);
    });

    it('reads packetAnimation false from localStorage', () => {
      localStorage.setItem('graph-packet-animation', 'false');
      const { result } = renderHook(() => useGraphState());
      expect(result.current.packetAnimation).toBe(false);
    });

    it('persists dashedAnimation to localStorage', () => {
      const { result } = renderHook(() => useGraphState());

      act(() => {
        result.current.setDashedAnimation(true);
      });

      expect(localStorage.getItem('graph-dashed-animation')).toBe('true');
      expect(result.current.dashedAnimation).toBe(true);
    });

    it('persists packetAnimation to localStorage', () => {
      const { result } = renderHook(() => useGraphState());

      act(() => {
        result.current.setPacketAnimation(false);
      });

      expect(localStorage.getItem('graph-packet-animation')).toBe('false');
      expect(result.current.packetAnimation).toBe(false);
    });
  });
});
