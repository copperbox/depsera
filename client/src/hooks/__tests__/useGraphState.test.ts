import { renderHook, act } from '@testing-library/react';
import { useGraphState } from '../useGraphState';
import { saveNodePositions, loadNodePositions, clearNodePositions } from '../../utils/graphLayoutStorage';

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

jest.mock('../../api/graph', () => ({
  fetchGraph: jest.fn().mockResolvedValue({ services: [], dependencies: [] }),
}));

jest.mock('../../api/teams', () => ({
  fetchTeams: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../utils/graphLayout', () => ({
  LAYOUT_DIRECTION_KEY: 'graph-layout-direction',
  TIER_SPACING_KEY: 'graph-tier-spacing',
  LATENCY_THRESHOLD_KEY: 'graph-latency-threshold',
  DEFAULT_TIER_SPACING: 150,
  MIN_TIER_SPACING: 50,
  MAX_TIER_SPACING: 400,
  DEFAULT_LATENCY_THRESHOLD: 50,
  MIN_LATENCY_THRESHOLD: 10,
  MAX_LATENCY_THRESHOLD: 200,
  transformGraphData: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
}));

jest.mock('../../utils/graphLayoutStorage');

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
    const { transformGraphData } = jest.requireMock('../../utils/graphLayout');
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
});
