import { type AppEdge, type AppNode } from './graphLayout';

export type IsolationTarget =
  | { type: 'service'; id: string }
  | { type: 'dependency'; id: string };

/**
 * Find all upstream nodes (nodes that the selected node depends on, following edge direction).
 */
export function getUpstreamNodeIds(nodeId: string, edges: AppEdge[]): Set<string> {
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

/**
 * Find all downstream nodes (nodes that depend on the selected node, following edge direction backwards).
 */
export function getDownstreamNodeIds(nodeId: string, edges: AppEdge[]): Set<string> {
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

/**
 * Find all nodes related to a given node (upstream + downstream, no turning around).
 */
export function getRelatedNodeIds(nodeId: string, edges: AppEdge[]): Set<string> {
  const upstream = getUpstreamNodeIds(nodeId, edges);
  const downstream = getDownstreamNodeIds(nodeId, edges);
  return new Set([...upstream, ...downstream]);
}

/**
 * Find all nodes related to an edge (only the direct chain the edge is part of).
 */
export function getRelatedNodeIdsFromEdge(edgeId: string, edges: AppEdge[]): Set<string> {
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

/**
 * Find all edges that connect related nodes in the dependency chain.
 */
export function getRelatedEdgeIds(
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

/**
 * Compute the isolated tree for a given isolation target.
 * Returns filtered nodes and edges, or null if the target cannot be resolved.
 */
export function getIsolatedTree(
  target: IsolationTarget,
  allNodes: AppNode[],
  allEdges: AppEdge[]
): { nodes: AppNode[]; edges: AppEdge[] } | null {
  let relevantNodeIds: Set<string>;

  if (target.type === 'service') {
    // Check the node exists
    if (!allNodes.some((n) => n.id === target.id)) return null;
    relevantNodeIds = getRelatedNodeIds(target.id, allEdges);
  } else {
    // Find the edge with matching dependencyId
    const matchingEdge = allEdges.find((e) => e.data?.dependencyId === target.id);
    if (!matchingEdge) return null;
    relevantNodeIds = getRelatedNodeIdsFromEdge(matchingEdge.id, allEdges);
  }

  const filteredNodes = allNodes.filter((n) => relevantNodeIds.has(n.id));
  const filteredEdges = allEdges.filter(
    (e) => relevantNodeIds.has(e.source) && relevantNodeIds.has(e.target)
  );

  return { nodes: filteredNodes, edges: filteredEdges };
}
