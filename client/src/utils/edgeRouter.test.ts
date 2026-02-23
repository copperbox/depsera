import { computeEdgeRoutes, DEFAULT_LANE_SPACING } from './edgeRouter';
import type { Node, Edge } from '@xyflow/react';

// Helpers — minimal objects that satisfy the properties used by computeEdgeRoutes
function makeNode(id: string, x: number, y: number): Node {
  return { id, position: { x, y }, data: {} } as Node;
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target, data: {} } as Edge;
}

describe('computeEdgeRoutes', () => {
  it('exports DEFAULT_LANE_SPACING constant', () => {
    expect(DEFAULT_LANE_SPACING).toBe(10);
  });

  it('returns empty map for empty graph', () => {
    const result = computeEdgeRoutes([], [], 'TB');
    expect(result.size).toBe(0);
  });

  it('returns empty map when there are nodes but no edges', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 200, 0)];
    const result = computeEdgeRoutes(nodes, [], 'TB');
    expect(result.size).toBe(0);
  });

  it('returns empty map when there are edges but no nodes', () => {
    const edges = [makeEdge('e1', 'a', 'b')];
    const result = computeEdgeRoutes([], edges, 'TB');
    expect(result.size).toBe(0);
  });

  // --- TB direction ---

  it('assigns lane at gap center for single edge (TB)', () => {
    // Layer 0: y=0, Layer 1: y=280
    const nodes = [makeNode('a', 0, 0), makeNode('b', 0, 280)];
    const edges = [makeEdge('e1', 'a', 'b')];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

    // Gap center = (0 + NODE_HEIGHT + 280) / 2 = (100 + 280) / 2 = 190
    expect(result.get('e1')).toBe(190);
  });

  it('spreads multiple edges from same source sorted by target X (TB)', () => {
    const nodes = [
      makeNode('a', 100, 0),
      makeNode('b', 0, 280),
      makeNode('c', 200, 280),
    ];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'a', 'c')];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

    // Gap center = 190
    // Sorted by target X: b (x=0) first, c (x=200) second
    // lane[0] = 190 + (0 - 0.5) * 10 = 185
    // lane[1] = 190 + (1 - 0.5) * 10 = 195
    expect(result.get('e1')).toBe(185);
    expect(result.get('e2')).toBe(195);
  });

  it('globally deduplicates lanes for edges from different sources in same layer (TB)', () => {
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('d', 200, 0), // same layer as a
      makeNode('b', 0, 280),
      makeNode('c', 200, 280),
    ];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'd', 'c')];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

    // Both route through gap 0
    // Sorted by target X: b (x=0) < c (x=200)
    expect(result.get('e1')).toBe(185);
    expect(result.get('e2')).toBe(195);
    // Unique lanes
    expect(result.get('e1')).not.toBe(result.get('e2'));
  });

  it('handles multi-layer spanning edges (TB)', () => {
    // Layer 0: y=0, Layer 1: y=280, Layer 2: y=560
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('b', 0, 280),
      makeNode('c', 0, 560),
    ];
    const edges = [
      makeEdge('e1', 'a', 'b'), // gap 0
      makeEdge('e2', 'a', 'c'), // also gap 0 (below source layer)
    ];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

    // Both assigned to gap 0 — center = 190
    expect(result.has('e1')).toBe(true);
    expect(result.has('e2')).toBe(true);
    // They are in the same gap so get spread lanes
    expect(result.get('e1')).not.toBe(result.get('e2'));
  });

  it('assigns lane for straight vertical edge where sourceX === targetX (TB)', () => {
    const nodes = [makeNode('a', 100, 0), makeNode('b', 100, 280)];
    const edges = [makeEdge('e1', 'a', 'b')];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

    // Still gets a lane assignment
    expect(result.has('e1')).toBe(true);
    expect(typeof result.get('e1')).toBe('number');
  });

  it('skips same-layer edges', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 200, 0)];
    const edges = [makeEdge('e1', 'a', 'b')];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

    expect(result.size).toBe(0);
  });

  it('respects custom lane spacing', () => {
    const nodes = [
      makeNode('a', 100, 0),
      makeNode('b', 0, 280),
      makeNode('c', 200, 280),
    ];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'a', 'c')];
    const result = computeEdgeRoutes(nodes, edges, 'TB', 20);

    // Gap center = 190
    // lane[0] = 190 + (0 - 0.5) * 20 = 180
    // lane[1] = 190 + (1 - 0.5) * 20 = 200
    expect(result.get('e1')).toBe(180);
    expect(result.get('e2')).toBe(200);
  });

  it('sub-sorts by source cross-axis when targets have same X (TB)', () => {
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('d', 200, 0),
      makeNode('b', 100, 280), // same X for both targets
      makeNode('c', 100, 280),
    ];
    // Both edges target X = 100, sub-sort by source X
    const edges = [makeEdge('e1', 'd', 'c'), makeEdge('e2', 'a', 'b')];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

    // e2 source a (x=0) < e1 source d (x=200)
    const lane1 = result.get('e2')!;
    const lane2 = result.get('e1')!;
    expect(lane1).toBeLessThan(lane2);
  });

  // --- LR direction ---

  it('uses X coordinates for lanes in LR direction', () => {
    const nodes = [
      makeNode('a', 0, 100),
      makeNode('b', 400, 0),
      makeNode('c', 400, 200),
    ];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'a', 'c')];
    const result = computeEdgeRoutes(nodes, edges, 'LR');

    // Gap center = (0 + NODE_WIDTH + 400) / 2 = (180 + 400) / 2 = 290
    // Sorted by target Y: b (y=0) < c (y=200)
    // lane[0] = 290 + (0 - 0.5) * 10 = 285
    // lane[1] = 290 + (1 - 0.5) * 10 = 295
    expect(result.get('e1')).toBe(285);
    expect(result.get('e2')).toBe(295);
  });

  it('assigns single lane at gap center for LR direction', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 400, 0)];
    const edges = [makeEdge('e1', 'a', 'b')];
    const result = computeEdgeRoutes(nodes, edges, 'LR');

    // Gap center = (0 + 180 + 400) / 2 = 290
    expect(result.get('e1')).toBe(290);
  });

  // --- Edge cases ---

  it('groups nodes within tolerance into same layer', () => {
    // Nodes at y=0 and y=3 should be in the same layer (tolerance = 5)
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('b', 200, 3), // same layer as a
      makeNode('c', 0, 280),
    ];
    const edges = [makeEdge('e1', 'a', 'c'), makeEdge('e2', 'b', 'c')];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

    // Both edges route through gap 0
    expect(result.has('e1')).toBe(true);
    expect(result.has('e2')).toBe(true);
  });

  it('handles edges where source node is not found', () => {
    const nodes = [makeNode('a', 0, 0)];
    const edges = [makeEdge('e1', 'missing', 'a')];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

    expect(result.size).toBe(0);
  });

  it('handles edges where target node is not found', () => {
    const nodes = [makeNode('a', 0, 0)];
    const edges = [makeEdge('e1', 'a', 'missing')];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

    expect(result.size).toBe(0);
  });
});
