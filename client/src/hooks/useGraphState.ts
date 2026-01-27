import { useState, useCallback, useRef, useEffect } from 'react';
import { useNodesState, useEdgesState } from '@xyflow/react';
import { TeamWithCounts } from '../types/team';
import {
  type AppNode,
  type AppEdge,
  type LayoutDirection,
  LAYOUT_DIRECTION_KEY,
  TIER_SPACING_KEY,
  LATENCY_THRESHOLD_KEY,
  DEFAULT_TIER_SPACING,
  MIN_TIER_SPACING,
  MAX_TIER_SPACING,
  DEFAULT_LATENCY_THRESHOLD,
  MIN_LATENCY_THRESHOLD,
  MAX_LATENCY_THRESHOLD,
  transformGraphData,
} from '../utils/graphLayout';
import { fetchGraph } from '../api/graph';
import { fetchTeams } from '../api/teams';

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
  tierSpacing: number;
  setTierSpacing: (spacing: number) => void;
  latencyThreshold: number;
  setLatencyThreshold: (threshold: number) => void;

  // Loading state
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;

  // Actions
  loadData: (isBackgroundRefresh?: boolean) => Promise<void>;

  // Refs for polling
  selectedTeamRef: React.MutableRefObject<string>;
  layoutDirectionRef: React.MutableRefObject<LayoutDirection>;
  tierSpacingRef: React.MutableRefObject<number>;
}

export function useGraphState(): UseGraphStateReturn {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
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

  const [tierSpacing, setTierSpacingState] = useState(() => {
    const stored = localStorage.getItem(TIER_SPACING_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= MIN_TIER_SPACING && parsed <= MAX_TIER_SPACING) {
        return parsed;
      }
    }
    return DEFAULT_TIER_SPACING;
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
  const tierSpacingRef = useRef(tierSpacing);
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
    tierSpacingRef.current = tierSpacing;
  }, [tierSpacing]);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    selectedEdgeIdRef.current = selectedEdgeId;
  }, [selectedEdgeId]);

  // Setters that persist to localStorage
  const setSelectedTeam = useCallback((team: string) => {
    setSelectedTeamState(team);
  }, []);

  const setLayoutDirection = useCallback((direction: LayoutDirection) => {
    setLayoutDirectionState(direction);
    localStorage.setItem(LAYOUT_DIRECTION_KEY, direction);
  }, []);

  const setTierSpacing = useCallback((spacing: number) => {
    setTierSpacingState(spacing);
    localStorage.setItem(TIER_SPACING_KEY, String(spacing));
  }, []);

  const setLatencyThreshold = useCallback((threshold: number) => {
    setLatencyThresholdState(threshold);
    localStorage.setItem(LATENCY_THRESHOLD_KEY, String(threshold));
  }, []);

  const loadData = useCallback(async (isBackgroundRefresh = false) => {
    const teamId = selectedTeamRef.current || undefined;
    const direction = layoutDirectionRef.current;
    const spacing = tierSpacingRef.current;

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

      // Preserve selection during refresh
      const currentSelectedNodeId = selectedNodeIdRef.current;
      const currentSelectedEdgeId = selectedEdgeIdRef.current;

      const nodesWithSelection = currentSelectedNodeId
        ? layoutedNodes.map(node => ({
            ...node,
            selected: node.id === currentSelectedNodeId,
          }))
        : layoutedNodes;

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
  }, [teams, setNodes, setEdges]);

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
    tierSpacing,
    setTierSpacing,
    latencyThreshold,
    setLatencyThreshold,
    isLoading,
    isRefreshing,
    error,
    loadData,
    selectedTeamRef,
    layoutDirectionRef,
    tierSpacingRef,
  };
}
