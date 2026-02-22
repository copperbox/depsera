import {
  getUpstreamNodeIds,
  getDownstreamNodeIds,
  getRelatedNodeIds,
  getRelatedNodeIdsFromEdge,
  getRelatedEdgeIds,
} from './graphTraversal';
import type { AppEdge } from './graphLayout';

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
