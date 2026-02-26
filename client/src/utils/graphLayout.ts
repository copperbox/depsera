import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
import { type Node, type Edge } from '@xyflow/react';
import {
  GraphResponse,
  GraphNode,
  GraphEdge,
  ServiceNodeData,
  GraphEdgeData,
  type EdgeStyle,
} from '../types/graph';
import { adjustLayerSpacing, computeEdgeRoutes } from './edgeRouter';

export type AppNode = Node<ServiceNodeData, 'service'>;
export type AppEdge = Edge<GraphEdgeData, 'custom'>;

export type LayoutDirection = 'TB' | 'LR';

export const LAYOUT_DIRECTION_KEY = 'graph-layout-direction';
export const EDGE_STYLE_KEY = 'graph-edge-style';
export const LATENCY_THRESHOLD_KEY = 'graph-latency-threshold';
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
  edgeStyle: EdgeStyle = 'orthogonal'
): Promise<{ nodes: AppNode[]; edges: AppEdge[] }> {
  // ELK uses 'DOWN' for top-to-bottom and 'RIGHT' for left-to-right
  const elkDirection = direction === 'TB' ? 'DOWN' : 'RIGHT';

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': elkDirection,
      'elk.spacing.nodeNode': '100',
      // Base spacing between layers — adjusted dynamically after layout
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      // Edge spacing
      'elk.spacing.edgeNode': '70',
      'elk.spacing.edgeEdge': '50',
      // Edge spacing between layers
      'elk.layered.spacing.edgeEdgeBetweenLayers': '30',
      'elk.layered.spacing.edgeNodeBetweenLayers': '30',
      // Minimize edge crossings
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      // Consider node size for spacing
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      // Better edge routing
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      // More layout optimization iterations
      'elk.layered.thoroughness': '15',
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

  let finalNodes: AppNode[];
  let routingLanes: Map<string, number>;

  if (edgeStyle === 'orthogonal') {
    // Adjust inter-layer spacing per gap based on edge density
    finalNodes = adjustLayerSpacing(layoutedNodes, edges, direction);
    // Compute orthogonal routing lanes on the adjusted positions
    routingLanes = computeEdgeRoutes(finalNodes, edges, direction);
  } else {
    finalNodes = layoutedNodes;
    routingLanes = new Map();
  }

  const layoutedEdges: AppEdge[] = edges.map((edge) => ({
    ...edge,
    data: {
      ...edge.data!,
      routingLane: routingLanes.get(edge.id) ?? null,
      layoutDirection: direction,
      edgeStyle,
    },
  }));

  return { nodes: finalNodes, edges: layoutedEdges };
}

/**
 * Compute a deterministic fingerprint of the graph topology (node IDs + edge connections).
 * Used to detect whether the topology has changed between refreshes.
 */
export function computeTopologyFingerprint(data: GraphResponse): string {
  const nodeIds = data.nodes.map(n => n.id).sort().join(',');
  const edgeKeys = data.edges.map(e => `${e.source}->${e.target}`).sort().join(',');
  return `${nodeIds}|${edgeKeys}`;
}

/**
 * Update node/edge data fields (health, latency, counts, etc.) without re-running layout.
 * Preserves existing positions and routing.
 */
export function updateGraphDataOnly(
  existingNodes: AppNode[],
  existingEdges: AppEdge[],
  newData: GraphResponse,
  direction: LayoutDirection = 'TB'
): { nodes: AppNode[]; edges: AppEdge[] } {
  // Build lookup from new data
  const newNodeMap = new Map(newData.nodes.map(n => [n.id, n]));

  // Recalculate reported health from edges (same logic as transformGraphData)
  const reportedHealth = new Map<string, { healthy: number; unhealthy: number }>();
  for (const edge of newData.edges) {
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

  // Update node data while preserving positions
  const nodes: AppNode[] = existingNodes.map(node => {
    const newNode = newNodeMap.get(node.id);
    if (!newNode) return node;
    const reported = reportedHealth.get(node.id) || { healthy: 0, unhealthy: 0 };
    return {
      ...node,
      data: {
        ...newNode.data,
        reportedHealthyCount: reported.healthy,
        reportedUnhealthyCount: reported.unhealthy,
        layoutDirection: direction,
      },
    };
  });

  // Update edge data while preserving routing
  const newEdgeMap = new Map(newData.edges.map(e => [e.id, e]));
  const edges: AppEdge[] = existingEdges.map(edge => {
    const newEdge = newEdgeMap.get(edge.id);
    if (!newEdge) return edge;
    return {
      ...edge,
      data: {
        ...edge.data,
        ...newEdge.data,
      },
    };
  });

  return { nodes, edges };
}

/**
 * Transform graph API response data into ReactFlow nodes and edges with layout applied.
 */
export async function transformGraphData(
  data: GraphResponse,
  direction: LayoutDirection = 'TB',
  edgeStyle: EdgeStyle = 'orthogonal'
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

  return await getLayoutedElements(nodes, edges, direction, edgeStyle);
}
