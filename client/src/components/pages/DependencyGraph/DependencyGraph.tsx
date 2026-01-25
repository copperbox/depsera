import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
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
  DependencyNodeData,
  GraphEdgeData,
  getServiceHealthStatus,
  getDependencyHealthStatus,
} from '../../../types/graph';
import { TeamWithCounts } from '../../../types/team';
import { ServiceNode } from './ServiceNode';
import { DependencyNode } from './DependencyNode';
import { CustomEdge } from './CustomEdge';
import styles from './DependencyGraph.module.css';

type AppNode = Node<ServiceNodeData | DependencyNodeData, 'service' | 'dependency'>;
type AppEdge = Edge<GraphEdgeData, 'custom'>;

const nodeTypes = {
  service: ServiceNode,
  dependency: DependencyNode,
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
  dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 100 });

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

function transformGraphData(data: GraphResponse): { nodes: AppNode[]; edges: AppEdge[] } {
  const nodes: AppNode[] = data.nodes.map((node: GraphNode) => ({
    id: node.id,
    type: node.type as 'service' | 'dependency',
    position: { x: 0, y: 0 },
    data: node.data,
  }));

  const edges: AppEdge[] = data.edges.map((edge: GraphEdge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'custom' as const,
    data: edge.data,
    animated: edge.data.relationship === 'depends_on',
  }));

  return getLayoutedElements(nodes, edges);
}

export function DependencyGraph() {
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([]);
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (teamId?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const [graphData, teamsData] = await Promise.all([
        fetchGraph(teamId ? { team: teamId } : undefined),
        teams.length === 0 ? fetchTeams() : Promise.resolve(teams),
      ]);

      if (teams.length === 0) {
        setTeams(teamsData);
      }

      const { nodes: layoutedNodes, edges: layoutedEdges } = transformGraphData(graphData);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph data');
    } finally {
      setIsLoading(false);
    }
  }, [teams, setNodes, setEdges]);

  useEffect(() => {
    loadData(selectedTeam || undefined);
  }, [selectedTeam]);

  const handleTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTeam(e.target.value);
  };

  // Filter nodes based on search query
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes;

    const query = searchQuery.toLowerCase();
    const matchingIds = new Set<string>();

    nodes.forEach((node) => {
      const data = node.data as ServiceNodeData | DependencyNodeData;
      if (data.name.toLowerCase().includes(query)) {
        matchingIds.add(node.id);
      }
      if ('teamName' in data && typeof data.teamName === 'string' && data.teamName.toLowerCase().includes(query)) {
        matchingIds.add(node.id);
      }
    });

    return nodes.map((node) => ({
      ...node,
      style: matchingIds.has(node.id)
        ? { opacity: 1 }
        : { opacity: 0.3 },
    }));
  }, [nodes, searchQuery]);

  const getMiniMapNodeColor = (node: AppNode) => {
    const data = node.data as ServiceNodeData | DependencyNodeData;
    let status: string;

    if (node.type === 'service') {
      status = getServiceHealthStatus(data as ServiceNodeData);
    } else {
      status = getDependencyHealthStatus(data as DependencyNodeData);
    }

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
          <button className={styles.retryButton} onClick={() => loadData(selectedTeam || undefined)}>
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
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
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
                  id="arrow-report"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af" />
                </marker>
                <marker
                  id="arrow-association"
                  viewBox="0 0 10 10"
                  refX="10"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
                </marker>
              </defs>
            </svg>
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
