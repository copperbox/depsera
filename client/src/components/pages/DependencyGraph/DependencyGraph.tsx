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
import dagre from 'dagre';
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
import styles from './DependencyGraph.module.css';

type AppNode = Node<ServiceNodeData, 'service'>;
type AppEdge = Edge<GraphEdgeData, 'custom'>;

const POLLING_ENABLED_KEY = 'graph-auto-refresh';
const POLLING_INTERVAL_KEY = 'graph-refresh-interval';
const LAYOUT_DIRECTION_KEY = 'graph-layout-direction';
const DEFAULT_INTERVAL = 30000;

type LayoutDirection = 'TB' | 'LR';

const INTERVAL_OPTIONS = [
  { value: 10000, label: '10s' },
  { value: 20000, label: '20s' },
  { value: 30000, label: '30s' },
  { value: 60000, label: '1m' },
];

const nodeTypes = {
  service: ServiceNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

const NODE_WIDTH = 180;
const NODE_HEIGHT = 100;

function getLayoutedElements(
  nodes: AppNode[],
  edges: AppEdge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: AppNode[]; edges: AppEdge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 180 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes: AppNode[] = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function transformGraphData(
  data: GraphResponse,
  direction: LayoutDirection = 'TB'
): { nodes: AppNode[]; edges: AppEdge[] } {
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

  return getLayoutedElements(nodes, edges, direction);
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

  // Polling state
  const [isPollingEnabled, setIsPollingEnabled] = useState(() => {
    const stored = localStorage.getItem(POLLING_ENABLED_KEY);
    return stored === 'true';
  });
  const [pollingInterval, setPollingInterval] = useState(() => {
    const stored = localStorage.getItem(POLLING_INTERVAL_KEY);
    return stored ? parseInt(stored, 10) : DEFAULT_INTERVAL;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pollingIntervalRef = useRef<number | null>(null);
  const selectedTeamRef = useRef(selectedTeam);
  const layoutDirectionRef = useRef(layoutDirection);

  // Keep refs in sync with state for use in polling callback
  useEffect(() => {
    selectedTeamRef.current = selectedTeam;
  }, [selectedTeam]);

  useEffect(() => {
    layoutDirectionRef.current = layoutDirection;
  }, [layoutDirection]);

  const loadData = useCallback(async (
    teamId?: string,
    direction: LayoutDirection = 'TB',
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

      const { nodes: layoutedNodes, edges: layoutedEdges } = transformGraphData(graphData, direction);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [teams, setNodes, setEdges]);

  // Initial load and team/direction change
  useEffect(() => {
    loadData(selectedTeam || undefined, layoutDirection);
  }, [selectedTeam, layoutDirection]);

  // Polling effect
  useEffect(() => {
    if (isPollingEnabled) {
      pollingIntervalRef.current = window.setInterval(() => {
        loadData(selectedTeamRef.current || undefined, layoutDirectionRef.current, true);
      }, pollingInterval);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isPollingEnabled, pollingInterval, loadData]);

  const handleTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTeam(e.target.value);
  };

  // Toggle polling on/off
  const togglePolling = () => {
    const newValue = !isPollingEnabled;
    setIsPollingEnabled(newValue);
    localStorage.setItem(POLLING_ENABLED_KEY, String(newValue));
  };

  // Change polling interval
  const handleIntervalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newInterval = parseInt(e.target.value, 10);
    setPollingInterval(newInterval);
    localStorage.setItem(POLLING_INTERVAL_KEY, String(newInterval));
  };

  // Change layout direction
  const handleDirectionChange = (direction: LayoutDirection) => {
    setLayoutDirection(direction);
    localStorage.setItem(LAYOUT_DIRECTION_KEY, direction);
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

  // Filter edges based on selection
  const filteredEdges = useMemo((): AppEdge[] => {
    if (!relatedEdgeIds) return edges.map((edge) => ({
      ...edge,
      data: {
        ...edge.data!,
        isSelected: false,
        isHighlighted: false,
      },
    }));

    return edges.map((edge) => {
      const isRelated = relatedEdgeIds.has(edge.id);
      const isSelected = edge.id === selectedEdgeId;
      return {
        ...edge,
        data: {
          ...edge.data!,
          isSelected,
          isHighlighted: isRelated && !isSelected,
        },
        style: isRelated
          ? { opacity: 1 }
          : { opacity: 0.2 },
      };
    });
  }, [edges, relatedEdgeIds, selectedEdgeId]);

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
          <button className={styles.retryButton} onClick={() => loadData(selectedTeam || undefined, layoutDirection)}>
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
