import {
  getUpstreamNodeIds,
  getDownstreamNodeIds,
  getRelatedNodeIds,
  getRelatedNodeIdsFromEdge,
  getRelatedEdgeIds,
  getIsolatedTree,
} from './graphTraversal';
import type { AppEdge, AppNode } from './graphLayout';

// Helper to create test edges
function createEdge(id: string, source: string, target: string): AppEdge {
  return {
    id,
    source,
    target,
    type: 'custom',
    data: { relationship: 'depends_on' },
  };
}

describe('getUpstreamNodeIds', () => {
  it('returns the node itself when no outgoing edges', () => {
    const edges: AppEdge[] = [createEdge('e1', 'B', 'A')];
    const result = getUpstreamNodeIds('A', edges);
    expect(result).toEqual(new Set(['A']));
  });

  it('follows edges where node is source (node depends on target)', () => {
    // A depends on B, B depends on C
    const edges: AppEdge[] = [
      createEdge('e1', 'A', 'B'),
      createEdge('e2', 'B', 'C'),
    ];
    const result = getUpstreamNodeIds('A', edges);
    expect(result).toEqual(new Set(['A', 'B', 'C']));
  });

  it('handles cycles without infinite loop', () => {
    // A -> B -> C -> A (cycle)
    const edges: AppEdge[] = [
      createEdge('e1', 'A', 'B'),
      createEdge('e2', 'B', 'C'),
      createEdge('e3', 'C', 'A'),
    ];
    const result = getUpstreamNodeIds('A', edges);
    expect(result).toEqual(new Set(['A', 'B', 'C']));
  });

  it('handles branching dependencies', () => {
    // A depends on B and C, both B and C depend on D
    const edges: AppEdge[] = [
      createEdge('e1', 'A', 'B'),
      createEdge('e2', 'A', 'C'),
      createEdge('e3', 'B', 'D'),
      createEdge('e4', 'C', 'D'),
    ];
    const result = getUpstreamNodeIds('A', edges);
    expect(result).toEqual(new Set(['A', 'B', 'C', 'D']));
  });
});

describe('getDownstreamNodeIds', () => {
  it('returns the node itself when no incoming edges', () => {
    const edges: AppEdge[] = [createEdge('e1', 'A', 'B')];
    const result = getDownstreamNodeIds('A', edges);
    expect(result).toEqual(new Set(['A']));
  });

  it('follows edges where node is target (source depends on node)', () => {
    // C depends on B, B depends on A
    const edges: AppEdge[] = [
      createEdge('e1', 'C', 'B'),
      createEdge('e2', 'B', 'A'),
    ];
    const result = getDownstreamNodeIds('A', edges);
    expect(result).toEqual(new Set(['A', 'B', 'C']));
  });

  it('handles cycles without infinite loop', () => {
    // A -> B -> C -> A (cycle)
    const edges: AppEdge[] = [
      createEdge('e1', 'A', 'B'),
      createEdge('e2', 'B', 'C'),
      createEdge('e3', 'C', 'A'),
    ];
    const result = getDownstreamNodeIds('A', edges);
    expect(result).toEqual(new Set(['A', 'B', 'C']));
  });

  it('handles multiple dependents', () => {
    // B and C depend on A
    const edges: AppEdge[] = [
      createEdge('e1', 'B', 'A'),
      createEdge('e2', 'C', 'A'),
    ];
    const result = getDownstreamNodeIds('A', edges);
    expect(result).toEqual(new Set(['A', 'B', 'C']));
  });
});

describe('getRelatedNodeIds', () => {
  it('combines upstream and downstream nodes', () => {
    // D depends on C depends on B depends on A, E depends on B
    const edges: AppEdge[] = [
      createEdge('e1', 'D', 'C'),
      createEdge('e2', 'C', 'B'),
      createEdge('e3', 'B', 'A'),
      createEdge('e4', 'E', 'B'),
    ];
    const result = getRelatedNodeIds('B', edges);
    // Upstream: B, A
    // Downstream: B, C, D, E
    expect(result).toEqual(new Set(['A', 'B', 'C', 'D', 'E']));
  });
});

describe('getRelatedNodeIdsFromEdge', () => {
  it('returns empty set for non-existent edge', () => {
    const edges: AppEdge[] = [createEdge('e1', 'A', 'B')];
    const result = getRelatedNodeIdsFromEdge('e999', edges);
    expect(result).toEqual(new Set());
  });

  it('returns nodes in the chain the edge is part of', () => {
    // D -> C -> B -> A (chain), E -> B (branch)
    const edges: AppEdge[] = [
      createEdge('e1', 'D', 'C'),
      createEdge('e2', 'C', 'B'),
      createEdge('e3', 'B', 'A'),
      createEdge('e4', 'E', 'B'),
    ];
    // For edge C->B: downstream from C includes D, upstream from B includes A
    const result = getRelatedNodeIdsFromEdge('e2', edges);
    // downstreamFromSource (C): C, D
    // upstreamFromTarget (B): B, A
    expect(result).toEqual(new Set(['A', 'B', 'C', 'D']));
  });
});

describe('getRelatedEdgeIds', () => {
  const edges: AppEdge[] = [
    createEdge('e1', 'D', 'C'),
    createEdge('e2', 'C', 'B'),
    createEdge('e3', 'B', 'A'),
    createEdge('e4', 'E', 'B'),
  ];

  it('returns empty set when no selection', () => {
    const result = getRelatedEdgeIds(null, null, edges);
    expect(result).toEqual(new Set());
  });

  it('returns edges in upstream and downstream chains for node selection', () => {
    // For node B:
    // Upstream: B, A (so edges within upstream: e3 (B->A))
    // Downstream: B, C, D, E (so edges within downstream: e1 (D->C), e2 (C->B), e4 (E->B))
    const result = getRelatedEdgeIds('B', null, edges);
    expect(result).toEqual(new Set(['e1', 'e2', 'e3', 'e4']));
  });

  it('returns edges in direct chain for edge selection', () => {
    // For edge e2 (C->B):
    // Always includes the selected edge itself
    // downstreamFromSource (C): C, D
    // upstreamFromTarget (B): B, A
    const result = getRelatedEdgeIds(null, 'e2', edges);
    // e2 is selected, e1 is D->C (both in downstream from C), e3 is B->A (both in upstream from B)
    expect(result).toEqual(new Set(['e1', 'e2', 'e3']));
  });

  it('returns empty set for non-existent edge selection', () => {
    const result = getRelatedEdgeIds(null, 'e999', edges);
    expect(result).toEqual(new Set());
  });
});

// Helper to create test nodes
function createNode(id: string, name: string): AppNode {
  return {
    id,
    position: { x: 0, y: 0 },
    type: 'service',
    data: {
      name,
      teamId: 'team-1',
      teamName: 'Team',
      healthEndpoint: '',
      isActive: true,
      dependencyCount: 0,
      healthyCount: 0,
      unhealthyCount: 0,
      lastPollSuccess: null,
      lastPollError: null,
      skippedCount: 0,
      reportedHealthyCount: 0,
      reportedUnhealthyCount: 0,
    },
  };
}

function createEdgeWithDep(id: string, source: string, target: string, dependencyId: string): AppEdge {
  return {
    id,
    source,
    target,
    type: 'custom',
    data: { relationship: 'depends_on', dependencyId },
  };
}

describe('getIsolatedTree', () => {
  // Graph: A -> B -> C, D -> B (A and D depend on B, B depends on C)
  const nodes: AppNode[] = [
    createNode('A', 'Service A'),
    createNode('B', 'Service B'),
    createNode('C', 'Service C'),
    createNode('D', 'Service D'),
    createNode('E', 'Service E'), // unconnected to B
  ];

  const edges: AppEdge[] = [
    createEdgeWithDep('e1', 'A', 'B', 'dep-1'),
    createEdgeWithDep('e2', 'B', 'C', 'dep-2'),
    createEdgeWithDep('e3', 'D', 'B', 'dep-3'),
    createEdgeWithDep('e4', 'E', 'A', 'dep-4'), // E depends on A
  ];

  it('isolates a service tree with upstream and downstream', () => {
    const result = getIsolatedTree({ type: 'service', id: 'B' }, nodes, edges);
    expect(result).not.toBeNull();
    const nodeIds = result!.nodes.map(n => n.id).sort();
    expect(nodeIds).toEqual(['A', 'B', 'C', 'D', 'E']);
    // All edges connecting these nodes should be included
    const edgeIds = result!.edges.map(e => e.id).sort();
    expect(edgeIds).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it('isolates a leaf node (no upstream)', () => {
    const result = getIsolatedTree({ type: 'service', id: 'C' }, nodes, edges);
    expect(result).not.toBeNull();
    const nodeIds = result!.nodes.map(n => n.id).sort();
    // C has no upstream deps, downstream: B, A, D, E
    expect(nodeIds).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('isolates a root node (no downstream)', () => {
    // E only has upstream edge to A
    const result = getIsolatedTree({ type: 'service', id: 'E' }, nodes, edges);
    expect(result).not.toBeNull();
    const nodeIds = result!.nodes.map(n => n.id).sort();
    // Upstream from E: E -> A -> B -> C
    expect(nodeIds).toEqual(['A', 'B', 'C', 'E']);
  });

  it('returns null for non-existent service', () => {
    const result = getIsolatedTree({ type: 'service', id: 'Z' }, nodes, edges);
    expect(result).toBeNull();
  });

  it('isolates from a dependency (edge)', () => {
    // dep-1 is edge A -> B (e1): downstream from source A + upstream from target B
    const result = getIsolatedTree({ type: 'dependency', id: 'dep-1' }, nodes, edges);
    expect(result).not.toBeNull();
    const nodeIds = result!.nodes.map(n => n.id).sort();
    // downstream from A (who depends on A): E -> A, so {A, E}
    // upstream from B (what B depends on): B -> C, so {B, C}
    expect(nodeIds).toEqual(['A', 'B', 'C', 'E']);
  });

  it('returns null for non-existent dependency', () => {
    const result = getIsolatedTree({ type: 'dependency', id: 'dep-999' }, nodes, edges);
    expect(result).toBeNull();
  });

  it('filters edges to only those connecting included nodes', () => {
    // Use a simpler graph: A -> B -> C, D (disconnected)
    const simpleNodes: AppNode[] = [
      createNode('A', 'A'),
      createNode('B', 'B'),
      createNode('C', 'C'),
      createNode('D', 'D'),
    ];
    const simpleEdges: AppEdge[] = [
      createEdgeWithDep('e1', 'A', 'B', 'dep-1'),
      createEdgeWithDep('e2', 'B', 'C', 'dep-2'),
      createEdgeWithDep('e3', 'D', 'C', 'dep-3'),
    ];

    const result = getIsolatedTree({ type: 'service', id: 'A' }, simpleNodes, simpleEdges);
    expect(result).not.toBeNull();
    const nodeIds = result!.nodes.map(n => n.id).sort();
    // A upstream: A, B, C; A downstream: A, D (D depends on C which is upstream from A? No.)
    // Upstream from A: A -> B -> C
    // Downstream from A: just A (nobody targets A)
    expect(nodeIds).toEqual(['A', 'B', 'C']);
    // Only edges between A, B, C
    const edgeIds = result!.edges.map(e => e.id).sort();
    expect(edgeIds).toEqual(['e1', 'e2']);
  });
});
