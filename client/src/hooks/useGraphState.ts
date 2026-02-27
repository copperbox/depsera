import { useState, useCallback, useRef, useEffect } from 'react';
import { useNodesState, useEdgesState, type NodeChange } from '@xyflow/react';
import { TeamWithCounts } from '../types/team';
import {
  type AppNode,
  type AppEdge,
  type LayoutDirection,
  LAYOUT_DIRECTION_KEY,
  EDGE_STYLE_KEY,
  DASHED_ANIMATION_KEY,
  PACKET_ANIMATION_KEY,
  transformGraphData,
  computeTopologyFingerprint,
  updateGraphDataOnly,
} from '../utils/graphLayout';
import type { EdgeStyle } from '../types/graph';
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
  edgeStyle: EdgeStyle;
  setEdgeStyle: (style: EdgeStyle) => void;

  // Animation state
  dashedAnimation: boolean;
  setDashedAnimation: (enabled: boolean) => void;
  packetAnimation: boolean;
  setPacketAnimation: (enabled: boolean) => void;

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
  edgeStyleRef: React.MutableRefObject<EdgeStyle>;
}

export interface UseGraphStateOptions {
  userId?: string;
  initialDependencyId?: string | null;
}

export function useGraphState(options: UseGraphStateOptions = {}): UseGraphStateReturn {
  const { userId, initialDependencyId } = options;
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

  const [edgeStyle, setEdgeStyleState] = useState<EdgeStyle>(() => {
    const stored = localStorage.getItem(EDGE_STYLE_KEY);
    return (stored === 'orthogonal' || stored === 'bezier') ? stored : 'orthogonal';
  });

  const [dashedAnimation, setDashedAnimationState] = useState<boolean>(() => {
    const stored = localStorage.getItem(DASHED_ANIMATION_KEY);
    return stored === 'true';
  });

  const [packetAnimation, setPacketAnimationState] = useState<boolean>(() => {
    const stored = localStorage.getItem(PACKET_ANIMATION_KEY);
    return stored !== 'false';
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refs for polling callback to access current state
  const selectedTeamRef = useRef(selectedTeam);
  const layoutDirectionRef = useRef(layoutDirection);
  const edgeStyleRef = useRef(edgeStyle);
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
    edgeStyleRef.current = edgeStyle;
  }, [edgeStyle]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    selectedEdgeIdRef.current = selectedEdgeId;
  }, [selectedEdgeId]);

  // Refs for accessing current nodes/edges in loadData without adding to deps
  const nodesRef = useRef<AppNode[]>([]);
  const edgesRef = useRef<AppEdge[]>([]);

  // Keep node/edge refs in sync
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // Topology fingerprint for skipping layout on unchanged topology
  const topologyFingerprintRef = useRef<string>('');

  // Track whether initial dependency selection has been applied
  const initialDependencyAppliedRef = useRef(false);

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

  const setEdgeStyle = useCallback((style: EdgeStyle) => {
    setEdgeStyleState(style);
    localStorage.setItem(EDGE_STYLE_KEY, style);
  }, []);

  const setDashedAnimation = useCallback((enabled: boolean) => {
    setDashedAnimationState(enabled);
    localStorage.setItem(DASHED_ANIMATION_KEY, String(enabled));
  }, []);

  const setPacketAnimation = useCallback((enabled: boolean) => {
    setPacketAnimationState(enabled);
    localStorage.setItem(PACKET_ANIMATION_KEY, String(enabled));
  }, []);

  const loadData = useCallback(async (isBackgroundRefresh = false) => {
    const teamId = selectedTeamRef.current || undefined;
    const direction = layoutDirectionRef.current;
    const style = edgeStyleRef.current;

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

      // Compute topology fingerprint
      const newFingerprint = computeTopologyFingerprint(graphData);
      const topologyChanged = newFingerprint !== topologyFingerprintRef.current;

      let layoutedNodes: AppNode[];
      let layoutedEdges: AppEdge[];

      if (isBackgroundRefresh && !topologyChanged && nodesRef.current.length > 0) {
        // Topology unchanged — update data only, skip expensive ELK layout
        const updated = updateGraphDataOnly(nodesRef.current, edgesRef.current, graphData, direction);
        layoutedNodes = updated.nodes;
        layoutedEdges = updated.edges;
      } else {
        // Full layout needed
        const result = await transformGraphData(graphData, direction, style);
        layoutedNodes = result.nodes;
        layoutedEdges = result.edges;
        topologyFingerprintRef.current = newFingerprint;
      }

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

      // Auto-select node for initial dependency navigation (e.g., from wallboard)
      if (initialDependencyId && !initialDependencyAppliedRef.current) {
        const matchingEdge = layoutedEdges.find(
          (e) => e.data?.dependencyId === initialDependencyId
        );
        if (matchingEdge) {
          const sourceNodeId = matchingEdge.source;
          setSelectedNodeId(sourceNodeId);
          initialDependencyAppliedRef.current = true;

          // Mark the source node as selected
          const finalNodes = nodesWithSelection.map((node) => ({
            ...node,
            selected: node.id === sourceNodeId,
          }));
          setNodes(finalNodes);
          setEdges(edgesWithSelection);
        } else {
          initialDependencyAppliedRef.current = true;
          setNodes(nodesWithSelection);
          setEdges(edgesWithSelection);
        }
      } else {
        setNodes(nodesWithSelection);
        setEdges(edgesWithSelection);
      }
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
    edgeStyle,
    setEdgeStyle,
    dashedAnimation,
    setDashedAnimation,
    packetAnimation,
    setPacketAnimation,
    isLoading,
    isRefreshing,
    error,
    loadData,
    resetLayout,
    selectedTeamRef,
    layoutDirectionRef,
    edgeStyleRef,
  };
}
