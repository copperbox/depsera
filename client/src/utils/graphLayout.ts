import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
import { type Node, type Edge } from '@xyflow/react';
import {
  GraphResponse,
  GraphNode,
  GraphEdge,
  ServiceNodeData,
  GraphEdgeData,
} from '../types/graph';

export type AppNode = Node<ServiceNodeData, 'service'>;
export type AppEdge = Edge<GraphEdgeData, 'custom'>;

export type LayoutDirection = 'TB' | 'LR';

export const LAYOUT_DIRECTION_KEY = 'graph-layout-direction';
export const TIER_SPACING_KEY = 'graph-tier-spacing';
export const LATENCY_THRESHOLD_KEY = 'graph-latency-threshold';
export const DEFAULT_TIER_SPACING = 180;
export const MIN_TIER_SPACING = 80;
export const MAX_TIER_SPACING = 400;
export const DEFAULT_LATENCY_THRESHOLD = 50;
export const MIN_LATENCY_THRESHOLD = 10;
export const MAX_LATENCY_THRESHOLD = 200;

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 100;

const elk = new ELK();

/**
 * Calculate layout positions for nodes using ELK layout algorithm.
 */
export async function getLayoutedElements(
  nodes: AppNode[],
  edges: AppEdge[],
  direction: LayoutDirection = 'TB',
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

/**
 * Transform graph API response data into ReactFlow nodes and edges with layout applied.
 */
export async function transformGraphData(
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
