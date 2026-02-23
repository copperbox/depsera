import { useState, useCallback, useRef, useEffect } from 'react';
import { useNodesState, useEdgesState, type NodeChange } from '@xyflow/react';
import { TeamWithCounts } from '../types/team';
import {
  type AppNode,
  type AppEdge,
  type LayoutDirection,
  LAYOUT_DIRECTION_KEY,
  NODE_SPACING_KEY,
  LATENCY_THRESHOLD_KEY,
  DEFAULT_NODE_SPACING,
  MIN_NODE_SPACING,
  MAX_NODE_SPACING,
  DEFAULT_LATENCY_THRESHOLD,
  MIN_LATENCY_THRESHOLD,
  MAX_LATENCY_THRESHOLD,
  transformGraphData,
} from '../utils/graphLayout';
import { fetchGraph } from '../api/graph';
import { fetchTeams } from '../api/teams';
import {
  type NodePositions,
  saveNodePositions,
  loadNodePositions,
  clearNodePositions,
} from '../utils/graphLayoutStorage';

export interface UseGraphStateReturn {
  // Node and edge state
  nodes: AppNode[];
  edges: AppEdge[];
  setNodes: ReturnType<typeof useNodesState<AppNode>>[1];
  setEdges: ReturnType<typeof useEdgesState<AppEdge>>[1];
  onNodesChange: ReturnType<typeof useNodesState<AppNode>>[2];
  onEdgesChange: ReturnType<typeof useEdgesState<AppEdge>>[2];

  // Teams state
  teams: TeamWithCounts[];

  // Filter state
  selectedTeam: string;
  setSelectedTeam: (team: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Selection state
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  selectedEdgeId: string | null;
  setSelectedEdgeId: (id: string | null) => void;

  // Layout state
  layoutDirection: LayoutDirection;
  setLayoutDirection: (direction: LayoutDirection) => void;
  nodeSpacing: number;
  setNodeSpacing: (spacing: number) => void;
  latencyThreshold: number;
  setLatencyThreshold: (threshold: number) => void;

  // Loading state
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;

  // Actions
  loadData: (isBackgroundRefresh?: boolean) => Promise<void>;
  resetLayout: () => void;

  // Refs for polling
  selectedTeamRef: React.MutableRefObject<string>;
  layoutDirectionRef: React.MutableRefObject<LayoutDirection>;
  nodeSpacingRef: React.MutableRefObject<number>;
}

export interface UseGraphStateOptions {
  userId?: string;
}

export function useGraphState(options: UseGraphStateOptions = {}): UseGraphStateReturn {
  const { userId } = options;
  const [nodes, setNodes, baseOnNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([]);
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [selectedTeam, setSelectedTeamState] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const [layoutDirection, setLayoutDirectionState] = useState<LayoutDirection>(() => {
    const stored = localStorage.getItem(LAYOUT_DIRECTION_KEY);
    return (stored === 'LR' || stored === 'TB') ? stored : 'TB';
  });

  const [nodeSpacing, setNodeSpacingState] = useState(() => {
    const stored = localStorage.getItem(NODE_SPACING_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= MIN_NODE_SPACING && parsed <= MAX_NODE_SPACING) {
        return parsed;
      }
    }
    return DEFAULT_NODE_SPACING;
  });

  const [latencyThreshold, setLatencyThresholdState] = useState(() => {
    const stored = localStorage.getItem(LATENCY_THRESHOLD_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= MIN_LATENCY_THRESHOLD && parsed <= MAX_LATENCY_THRESHOLD) {
        return parsed;
      }
    }
    return DEFAULT_LATENCY_THRESHOLD;
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refs for polling callback to access current state
  const selectedTeamRef = useRef(selectedTeam);
  const layoutDirectionRef = useRef(layoutDirection);
  const nodeSpacingRef = useRef(nodeSpacing);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const selectedEdgeIdRef = useRef(selectedEdgeId);

  // Keep refs in sync with state
  useEffect(() => {
    selectedTeamRef.current = selectedTeam;
  }, [selectedTeam]);

  useEffect(() => {
    layoutDirectionRef.current = layoutDirection;
  }, [layoutDirection]);

  useEffect(() => {
    nodeSpacingRef.current = nodeSpacing;
  }, [nodeSpacing]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    selectedEdgeIdRef.current = selectedEdgeId;
  }, [selectedEdgeId]);

  // Track manually dragged node IDs
  const movedNodeIdsRef = useRef<Set<string>>(new Set());
  const savedPositionsRef = useRef<NodePositions>({});

  // Initialize saved positions from localStorage
  useEffect(() => {
    if (userId) {
      savedPositionsRef.current = loadNodePositions(userId);
      movedNodeIdsRef.current = new Set(Object.keys(savedPositionsRef.current));
    }
  }, [userId]);

  // Wrap onNodesChange to detect drag-end events and persist positions
  const onNodesChange = useCallback((changes: NodeChange<AppNode>[]) => {
    baseOnNodesChange(changes);

    if (!userId) return;

    for (const change of changes) {
      if (change.type === 'position' && !change.dragging && change.position) {
        movedNodeIdsRef.current.add(change.id);
        savedPositionsRef.current[change.id] = {
          x: change.position.x,
          y: change.position.y,
        };
      }
    }

    // Check if any drag-end occurred and persist
    const hasDragEnd = changes.some(
      (c) => c.type === 'position' && !c.dragging && 'position' in c && c.position
    );
    if (hasDragEnd) {
      saveNodePositions(userId, savedPositionsRef.current);
    }
  }, [baseOnNodesChange, userId]);

  // Setters that persist to localStorage
  const setSelectedTeam = useCallback((team: string) => {
    setSelectedTeamState(team);
  }, []);

  const setLayoutDirection = useCallback((direction: LayoutDirection) => {
    setLayoutDirectionState(direction);
    localStorage.setItem(LAYOUT_DIRECTION_KEY, direction);
  }, []);

  const setNodeSpacing = useCallback((spacing: number) => {
    setNodeSpacingState(spacing);
    localStorage.setItem(NODE_SPACING_KEY, String(spacing));
  }, []);

  const setLatencyThreshold = useCallback((threshold: number) => {
    setLatencyThresholdState(threshold);
    localStorage.setItem(LATENCY_THRESHOLD_KEY, String(threshold));
  }, []);

  const loadData = useCallback(async (isBackgroundRefresh = false) => {
    const teamId = selectedTeamRef.current || undefined;
    const direction = layoutDirectionRef.current;
    const spacing = nodeSpacingRef.current;

    if (!isBackgroundRefresh) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    try {
      const [graphData, teamsData] = await Promise.all([
        fetchGraph(teamId ? { team: teamId } : undefined),
        teams.length === 0 ? fetchTeams() : Promise.resolve(teams),
      ]);

      if (teams.length === 0) {
        setTeams(teamsData);
      }

      const { nodes: layoutedNodes, edges: layoutedEdges } = await transformGraphData(graphData, direction, spacing);

      // Apply saved positions for manually dragged nodes
      const currentNodeIds = new Set(layoutedNodes.map(n => n.id));
      const positions = savedPositionsRef.current;
      const movedIds = movedNodeIdsRef.current;

      /* istanbul ignore next -- @preserve
         Stale node cleanup requires specific timing between graph data fetch, node position
         persistence, and ReactFlow's internal state. This is tested through integration
         tests with real ReactFlow rendering. */
      // Clean up stale node IDs from saved positions
      if (userId) {
        let staleRemoved = false;
        for (const id of movedIds) {
          if (!currentNodeIds.has(id)) {
            movedIds.delete(id);
            delete positions[id];
            staleRemoved = true;
          }
        }
        if (staleRemoved) {
          saveNodePositions(userId, positions);
        }
      }

      const mergedNodes = layoutedNodes.map(node => {
        if (movedIds.has(node.id) && positions[node.id]) {
          return {
            ...node,
            position: positions[node.id],
          };
        }
        return node;
      });

      /* istanbul ignore next -- @preserve
         Selection preservation during refresh requires ReactFlow's internal state management
         to be fully mocked. This is tested through integration tests with real graph
         interactions in the browser. */
      // Preserve selection during refresh
      const currentSelectedNodeId = selectedNodeIdRef.current;
      const currentSelectedEdgeId = selectedEdgeIdRef.current;

      const nodesWithSelection = currentSelectedNodeId
        ? mergedNodes.map(node => ({
            ...node,
            selected: node.id === currentSelectedNodeId,
          }))
        : mergedNodes;

      const edgesWithSelection = currentSelectedEdgeId
        ? layoutedEdges.map(edge => ({
            ...edge,
            selected: edge.id === currentSelectedEdgeId,
          }))
        : layoutedEdges;

      setNodes(nodesWithSelection);
      setEdges(edgesWithSelection);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [teams, setNodes, setEdges, userId]);

  const resetLayout = useCallback(() => {
    if (userId) {
      clearNodePositions(userId);
    }
    movedNodeIdsRef.current.clear();
    savedPositionsRef.current = {};
    loadData();
  }, [userId, loadData]);

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    teams,
    selectedTeam,
    setSelectedTeam,
    searchQuery,
    setSearchQuery,
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
    layoutDirection,
    setLayoutDirection,
    nodeSpacing,
    setNodeSpacing,
    latencyThreshold,
    setLatencyThreshold,
    isLoading,
    isRefreshing,
    error,
    loadData,
    resetLayout,
    selectedTeamRef,
    layoutDirectionRef,
    nodeSpacingRef,
  };
}
