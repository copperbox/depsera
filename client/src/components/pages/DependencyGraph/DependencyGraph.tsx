import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  useOnSelectionChange,
  type Node,
  type Edge,
  type EdgeMouseHandler,
  BackgroundVariant,
} from '@xyflow/react';
import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
import '@xyflow/react/dist/style.css';

import { fetchGraph } from '../../../api/graph';
import { fetchTeams } from '../../../api/teams';
import {
  GraphResponse,
  GraphNode,
  GraphEdge,
  ServiceNodeData,
  GraphEdgeData,
  getServiceHealthStatus,
} from '../../../types/graph';
import { TeamWithCounts } from '../../../types/team';
import { ServiceNode } from './ServiceNode';
import { CustomEdge } from './CustomEdge';
import { NodeDetailsPanel } from './NodeDetailsPanel';
import { EdgeDetailsPanel } from './EdgeDetailsPanel';
import { usePolling, INTERVAL_OPTIONS } from '../../../hooks/usePolling';
import styles from './DependencyGraph.module.css';

type AppNode = Node<ServiceNodeData, 'service'>;
type AppEdge = Edge<GraphEdgeData, 'custom'>;

const LAYOUT_DIRECTION_KEY = 'graph-layout-direction';
const TIER_SPACING_KEY = 'graph-tier-spacing';
const LATENCY_THRESHOLD_KEY = 'graph-latency-threshold';
const DEFAULT_TIER_SPACING = 180;
const MIN_TIER_SPACING = 80;
const MAX_TIER_SPACING = 400;
const DEFAULT_LATENCY_THRESHOLD = 50;
const MIN_LATENCY_THRESHOLD = 10;
const MAX_LATENCY_THRESHOLD = 200;

type LayoutDirection = 'TB' | 'LR';

const nodeTypes = {
  service: ServiceNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

const NODE_WIDTH = 180;
const NODE_HEIGHT = 100;

const elk = new ELK();

async function getLayoutedElements(
  nodes: AppNode[],
  edges: AppEdge[],
  direction: 'TB' | 'LR' = 'TB',
  tierSpacing: number = DEFAULT_TIER_SPACING
): Promise<{ nodes: AppNode[]; edges: AppEdge[] }> {
  // ELK uses 'DOWN' for top-to-bottom and 'RIGHT' for left-to-right
  const elkDirection = direction === 'TB' ? 'DOWN' : 'RIGHT';

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': elkDirection,
      // Node spacing within the same layer
      'elk.spacing.nodeNode': '100',
      // Spacing between layers (tiers)
      'elk.layered.spacing.nodeNodeBetweenLayers': String(tierSpacing),
      // Edge spacing
      'elk.spacing.edgeNode': '50',
      'elk.spacing.edgeEdge': '30',
      // Minimize edge crossings
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      // Consider node size for spacing
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      // Better edge routing
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      // Separate connected components
      'elk.separateConnectedComponents': 'true',
      'elk.spacing.componentComponent': '150',
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: edges.map((edge): ElkExtendedEdge => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layoutedGraph = await elk.layout(elkGraph);

  const layoutedNodes: AppNode[] = nodes.map((node) => {
    const elkNode = layoutedGraph.children?.find((n) => n.id === node.id);
    return {
      ...node,
      position: {
        x: elkNode?.x ?? 0,
        y: elkNode?.y ?? 0,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

async function transformGraphData(
  data: GraphResponse,
  direction: LayoutDirection = 'TB',
  tierSpacing: number = DEFAULT_TIER_SPACING
): Promise<{ nodes: AppNode[]; edges: AppEdge[] }> {
  // Calculate reported health for each node based on incoming edges
  // (edges where the node is the SOURCE, meaning other services depend on it)
  const reportedHealth = new Map<string, { healthy: number; unhealthy: number }>();

  for (const edge of data.edges) {
    // edge.source is the dependency provider (the service being depended upon)
    // edge.data.healthy is what the dependent reports about this service
    const sourceId = edge.source;
    if (!reportedHealth.has(sourceId)) {
      reportedHealth.set(sourceId, { healthy: 0, unhealthy: 0 });
    }
    const counts = reportedHealth.get(sourceId)!;
    if (edge.data.healthy === true) {
      counts.healthy++;
    } else if (edge.data.healthy === false) {
      counts.unhealthy++;
    }
  }

  const nodes: AppNode[] = data.nodes.map((node: GraphNode) => {
    const reported = reportedHealth.get(node.id) || { healthy: 0, unhealthy: 0 };
    return {
      id: node.id,
      type: 'service' as const,
      position: { x: 0, y: 0 },
      data: {
        ...node.data,
        reportedHealthyCount: reported.healthy,
        reportedUnhealthyCount: reported.unhealthy,
        layoutDirection: direction,
      },
    };
  });

  const edges: AppEdge[] = data.edges.map((edge: GraphEdge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'custom' as const,
    data: edge.data,
    animated: true,
  }));

  return await getLayoutedElements(nodes, edges, direction, tierSpacing);
}

// Find all upstream nodes (nodes that the selected node depends on, following edge direction)
function getUpstreamNodeIds(nodeId: string, edges: AppEdge[]): Set<string> {
  const upstream = new Set<string>();
  const visited = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    upstream.add(current);

    // Follow edges where current node is the SOURCE (current depends on target)
    for (const edge of edges) {
      if (edge.source === current && !visited.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  return upstream;
}

// Find all downstream nodes (nodes that depend on the selected node, following edge direction backwards)
function getDownstreamNodeIds(nodeId: string, edges: AppEdge[]): Set<string> {
  const downstream = new Set<string>();
  const visited = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    downstream.add(current);

    // Follow edges where current node is the TARGET (source depends on current)
    for (const edge of edges) {
      if (edge.target === current && !visited.has(edge.source)) {
        queue.push(edge.source);
      }
    }
  }

  return downstream;
}

// Find all nodes related to a given node (upstream + downstream, no turning around)
function getRelatedNodeIds(nodeId: string, edges: AppEdge[]): Set<string> {
  const upstream = getUpstreamNodeIds(nodeId, edges);
  const downstream = getDownstreamNodeIds(nodeId, edges);
  return new Set([...upstream, ...downstream]);
}

// Find all nodes related to an edge (only the direct chain the edge is part of)
function getRelatedNodeIdsFromEdge(edgeId: string, edges: AppEdge[]): Set<string> {
  const edge = edges.find((e) => e.id === edgeId);
  if (!edge) return new Set<string>();

  // For edge source→target (source depends on target):
  // - Downstream from source: things that depend on the source
  // - Upstream from target: things the target depends on
  const downstreamFromSource = getDownstreamNodeIds(edge.source, edges);
  const upstreamFromTarget = getUpstreamNodeIds(edge.target, edges);

  // Combine to get just the chain this edge is part of
  return new Set([...downstreamFromSource, ...upstreamFromTarget]);
}

// Find all edges that connect related nodes in the dependency chain
function getRelatedEdgeIds(
  selectedNodeId: string | null,
  selectedEdgeId: string | null,
  edges: AppEdge[]
): Set<string> {
  const relatedEdges = new Set<string>();

  // For node selection: only include edges that are part of the upstream/downstream chains
  if (selectedNodeId) {
    const upstream = getUpstreamNodeIds(selectedNodeId, edges);
    const downstream = getDownstreamNodeIds(selectedNodeId, edges);

    for (const edge of edges) {
      // Edge is in upstream chain: source is in upstream, target is in upstream
      const inUpstream = upstream.has(edge.source) && upstream.has(edge.target);
      // Edge is in downstream chain: source is in downstream, target is in downstream
      const inDownstream = downstream.has(edge.source) && downstream.has(edge.target);

      if (inUpstream || inDownstream) {
        relatedEdges.add(edge.id);
      }
    }
  } else if (selectedEdgeId) {
    // For edge selection: only include edges in the direct chain
    const selectedEdge = edges.find((e) => e.id === selectedEdgeId);
    if (selectedEdge) {
      // Always include the selected edge itself
      relatedEdges.add(selectedEdgeId);

      const downstreamFromSource = getDownstreamNodeIds(selectedEdge.source, edges);
      const upstreamFromTarget = getUpstreamNodeIds(selectedEdge.target, edges);

      for (const edge of edges) {
        // Edge is in downstream chain from source
        const inDownstream = downstreamFromSource.has(edge.source) && downstreamFromSource.has(edge.target);
        // Edge is in upstream chain from target
        const inUpstream = upstreamFromTarget.has(edge.source) && upstreamFromTarget.has(edge.target);

        if (inDownstream || inUpstream) {
          relatedEdges.add(edge.id);
        }
      }
    }
  }

  return relatedEdges;
}

function DependencyGraphInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([]);
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>(() => {
    const stored = localStorage.getItem(LAYOUT_DIRECTION_KEY);
    return (stored === 'LR' || stored === 'TB') ? stored : 'TB';
  });
  const [tierSpacing, setTierSpacing] = useState(() => {
    const stored = localStorage.getItem(TIER_SPACING_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= MIN_TIER_SPACING && parsed <= MAX_TIER_SPACING) {
        return parsed;
      }
    }
    return DEFAULT_TIER_SPACING;
  });
  const [latencyThreshold, setLatencyThreshold] = useState(() => {
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
  const selectedTeamRef = useRef(selectedTeam);
  const layoutDirectionRef = useRef(layoutDirection);
  const tierSpacingRef = useRef(tierSpacing);
  const selectedNodeIdRef = useRef(selectedNodeId);
  const selectedEdgeIdRef = useRef(selectedEdgeId);

  // Keep refs in sync with state for use in polling callback
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

  const loadData = useCallback(async (
    teamId?: string,
    direction: LayoutDirection = 'TB',
    spacing: number = DEFAULT_TIER_SPACING,
    isBackgroundRefresh = false
  ) => {
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

  // Initial load and team/direction/spacing change
  useEffect(() => {
    loadData(selectedTeam || undefined, layoutDirection, tierSpacing);
  }, [selectedTeam, layoutDirection, tierSpacing]);

  // Polling hook
  const { isPollingEnabled, pollingInterval, togglePolling, handleIntervalChange } = usePolling({
    storageKey: 'graph',
    onPoll: useCallback(() => {
      loadData(selectedTeamRef.current || undefined, layoutDirectionRef.current, tierSpacingRef.current, true);
    }, [loadData]),
  });

  const handleTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTeam(e.target.value);
  };

  // Change layout direction
  const handleDirectionChange = (direction: LayoutDirection) => {
    setLayoutDirection(direction);
    localStorage.setItem(LAYOUT_DIRECTION_KEY, direction);
  };

  // Change tier spacing
  const handleTierSpacingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSpacing = parseInt(e.target.value, 10);
    setTierSpacing(newSpacing);
    localStorage.setItem(TIER_SPACING_KEY, String(newSpacing));
  };

  // Change latency threshold
  const handleLatencyThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newThreshold = parseInt(e.target.value, 10);
    setLatencyThreshold(newThreshold);
    localStorage.setItem(LATENCY_THRESHOLD_KEY, String(newThreshold));
  };

  // Get the selected node's data for the details panel
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  // Get related node IDs when a node or edge is selected
  const relatedNodeIds = useMemo(() => {
    if (selectedNodeId) {
      return getRelatedNodeIds(selectedNodeId, edges);
    }
    if (selectedEdgeId) {
      return getRelatedNodeIdsFromEdge(selectedEdgeId, edges);
    }
    return null;
  }, [selectedNodeId, selectedEdgeId, edges]);

  // Get related edge IDs based on selection
  const relatedEdgeIds = useMemo(() => {
    if (!selectedNodeId && !selectedEdgeId) return null;
    return getRelatedEdgeIds(selectedNodeId, selectedEdgeId, edges);
  }, [selectedNodeId, selectedEdgeId, edges]);

  // Filter nodes based on search query and selection
  const filteredNodes = useMemo(() => {
    let result = nodes;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchingIds = new Set<string>();

      nodes.forEach((node) => {
        if (node.data.name.toLowerCase().includes(query)) {
          matchingIds.add(node.id);
        }
        if (node.data.teamName?.toLowerCase().includes(query)) {
          matchingIds.add(node.id);
        }
      });

      result = nodes.map((node) => ({
        ...node,
        style: matchingIds.has(node.id)
          ? { opacity: 1 }
          : { opacity: 0.3 },
      }));
    }

    // Apply selection highlighting
    if (relatedNodeIds) {
      result = result.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isSelected: node.id === selectedNodeId,
        },
        style: relatedNodeIds.has(node.id)
          ? { ...(node.style || {}), opacity: 1 }
          : { ...(node.style || {}), opacity: 0.2 },
      }));
    }

    return result;
  }, [nodes, searchQuery, relatedNodeIds, selectedNodeId]);

  // Compute whether an edge has high latency
  const computeIsHighLatency = useCallback((latencyMs: number | null | undefined, avgLatencyMs24h: number | null | undefined): boolean => {
    if (!latencyMs || !avgLatencyMs24h || avgLatencyMs24h === 0) return false;
    const threshold = 1 + latencyThreshold / 100;
    return latencyMs > avgLatencyMs24h * threshold;
  }, [latencyThreshold]);

  // Filter edges based on selection
  const filteredEdges = useMemo((): AppEdge[] => {
    const processEdge = (edge: AppEdge, isSelected: boolean, isHighlighted: boolean, opacity: number): AppEdge => {
      const isHighLatency = computeIsHighLatency(edge.data?.latencyMs, edge.data?.avgLatencyMs24h);
      return {
        ...edge,
        data: {
          ...edge.data!,
          isSelected,
          isHighlighted,
          isHighLatency,
        },
        style: { opacity },
      };
    };

    if (!relatedEdgeIds) {
      return edges.map((edge) => processEdge(edge, false, false, 1));
    }

    return edges.map((edge) => {
      const isRelated = relatedEdgeIds.has(edge.id);
      const isSelected = edge.id === selectedEdgeId;
      return processEdge(edge, isSelected, isRelated && !isSelected, isRelated ? 1 : 0.2);
    });
  }, [edges, relatedEdgeIds, selectedEdgeId, computeIsHighLatency]);

  // Get the selected edge's data for the details panel
  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    return filteredEdges.find((e) => e.id === selectedEdgeId) || null;
  }, [filteredEdges, selectedEdgeId]);

  // Handle node selection change
  useOnSelectionChange({
    onChange: ({ nodes: selectedNodes }) => {
      if (selectedNodes.length > 0) {
        setSelectedNodeId(selectedNodes[0].id);
        setSelectedEdgeId(null); // Clear edge selection when node is selected
      } else {
        setSelectedNodeId(null);
      }
    },
  });

  // Handle edge click
  const handleEdgeClick: EdgeMouseHandler<AppEdge> = useCallback((_, edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null); // Clear node selection when edge is selected
  }, []);

  // Handle pane click (deselect all)
  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const getMiniMapNodeColor = (node: AppNode) => {
    const status = getServiceHealthStatus(node.data);

    switch (status) {
      case 'healthy':
        return '#10b981';
      case 'warning':
        return '#f59e0b';
      case 'critical':
        return '#dc2626';
      default:
        return '#9ca3af';
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading dependency graph...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <span>{error}</span>
          <button className={styles.retryButton} onClick={() => loadData(selectedTeam || undefined, layoutDirection, tierSpacing)}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <label className={styles.toolbarLabel}>Team:</label>
          <select
            className={styles.select}
            value={selectedTeam}
            onChange={handleTeamChange}
          >
            <option value="">All Teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.toolbarGroup}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.toolbarGroup}>
          <label className={styles.toolbarLabel}>Layout:</label>
          <div className={styles.directionToggle}>
            <button
              className={`${styles.directionButton} ${layoutDirection === 'TB' ? styles.directionActive : ''}`}
              onClick={() => handleDirectionChange('TB')}
              title="Top to Bottom"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M12 3v18M12 21l-4-4M12 21l4-4" />
              </svg>
            </button>
            <button
              className={`${styles.directionButton} ${layoutDirection === 'LR' ? styles.directionActive : ''}`}
              onClick={() => handleDirectionChange('LR')}
              title="Left to Right"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M3 12h18M21 12l-4-4M21 12l-4 4" />
              </svg>
            </button>
          </div>
        </div>

        <div className={styles.toolbarGroup}>
          <label className={styles.toolbarLabel}>Tier spacing:</label>
          <input
            type="range"
            className={styles.tierSpacingSlider}
            min={MIN_TIER_SPACING}
            max={MAX_TIER_SPACING}
            step={10}
            value={tierSpacing}
            onChange={handleTierSpacingChange}
            title={`${tierSpacing}px`}
          />
          <span className={styles.tierSpacingValue}>{tierSpacing}px</span>
        </div>

        <div className={styles.toolbarGroup}>
          <label className={styles.toolbarLabel}>High latency:</label>
          <input
            type="range"
            className={styles.latencyThresholdSlider}
            min={MIN_LATENCY_THRESHOLD}
            max={MAX_LATENCY_THRESHOLD}
            step={10}
            value={latencyThreshold}
            onChange={handleLatencyThresholdChange}
            title={`Alert when ${latencyThreshold}% above average`}
          />
          <span className={styles.latencyThresholdValue}>+{latencyThreshold}%</span>
        </div>

        <div className={styles.autoRefreshControls}>
          {isRefreshing && (
            <div className={styles.refreshingIndicator}>
              <div className={styles.spinnerSmall} />
            </div>
          )}
          <span className={styles.autoRefreshLabel}>Auto-refresh</span>
          <button
            role="switch"
            aria-checked={isPollingEnabled}
            onClick={togglePolling}
            className={`${styles.togglePill} ${isPollingEnabled ? styles.toggleActive : ''}`}
          >
            <span className={styles.toggleKnob} />
          </button>
          <select
            value={pollingInterval}
            onChange={handleIntervalChange}
            className={styles.intervalSelect}
            disabled={!isPollingEnabled}
            aria-label="Refresh interval"
          >
            {INTERVAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.toolbarSpacer} />

        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <div className={`${styles.legendDot} ${styles.healthy}`} />
            <span>Healthy</span>
          </div>
          <div className={styles.legendItem}>
            <div className={`${styles.legendDot} ${styles.warning}`} />
            <span>Warning</span>
          </div>
          <div className={styles.legendItem}>
            <div className={`${styles.legendDot} ${styles.critical}`} />
            <span>Critical</span>
          </div>
          <div className={styles.legendItem}>
            <div className={`${styles.legendDot} ${styles.unknown}`} />
            <span>Unknown</span>
          </div>
          <div className={styles.legendItem}>
            <div className={`${styles.legendDot} ${styles.highLatency}`} />
            <span>High Latency</span>
          </div>
        </div>
      </div>

      <div className={styles.mainContent}>
        <div className={styles.graphWrapper}>
          {filteredNodes.length === 0 ? (
            <div className={styles.emptyState}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
                />
              </svg>
              <span>No services or dependencies to display</span>
            </div>
          ) : (
            <ReactFlow
              nodes={filteredNodes}
              edges={filteredEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onEdgeClick={handleEdgeClick}
              onPaneClick={handlePaneClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              maxZoom={2}
              defaultEdgeOptions={{
                type: 'custom',
              }}
            >
              <Controls />
              <MiniMap
                nodeColor={getMiniMapNodeColor}
                maskColor="rgba(0, 0, 0, 0.1)"
                pannable
                zoomable
              />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />

              {/* Custom marker definitions */}
              <svg>
                <defs>
                  <marker
                    id="arrow-dependency"
                    viewBox="0 0 10 10"
                    refX="10"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
                  </marker>
                </defs>
              </svg>
            </ReactFlow>
          )}
        </div>

        {selectedNode && (
          <NodeDetailsPanel
            nodeId={selectedNode.id}
            data={selectedNode.data}
            nodes={nodes}
            edges={edges}
            onClose={() => setSelectedNodeId(null)}
          />
        )}

        {selectedEdge && selectedEdge.data && (
          <EdgeDetailsPanel
            edgeId={selectedEdge.id}
            data={selectedEdge.data}
            sourceNode={nodes.find((n) => n.id === selectedEdge.source)}
            targetNode={nodes.find((n) => n.id === selectedEdge.target)}
            onClose={() => setSelectedEdgeId(null)}
          />
        )}
      </div>
    </div>
  );
}

export function DependencyGraph() {
  return (
    <ReactFlowProvider>
      <DependencyGraphInner />
    </ReactFlowProvider>
  );
}
