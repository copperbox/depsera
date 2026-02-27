import {
  computeEdgeRoutes,
  computeMaxLanesPerGap,
  adjustLayerSpacing,
  DEFAULT_LANE_SPACING,
  DEFAULT_LANE_PADDING,
  MIN_LAYER_GAP,
} from './edgeRouter';
import type { Node, Edge } from '@xyflow/react';

const NODE_HEIGHT = 100;
const NODE_WIDTH = 180;

// Helpers — minimal objects that satisfy the properties used by the edge router
function makeNode(id: string, x: number, y: number): Node {
  return { id, position: { x, y }, data: {} } as Node;
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target, data: {} } as Edge;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('exports DEFAULT_LANE_SPACING', () => {
    expect(DEFAULT_LANE_SPACING).toBe(15);
  });

  it('exports DEFAULT_LANE_PADDING', () => {
    expect(DEFAULT_LANE_PADDING).toBe(30);
  });

  it('exports MIN_LAYER_GAP', () => {
    expect(MIN_LAYER_GAP).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// computeEdgeRoutes
// ---------------------------------------------------------------------------

describe('computeEdgeRoutes', () => {
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
    const nodes = [makeNode('a', 0, 0), makeNode('b', 0, 280)];
    const edges = [makeEdge('e1', 'a', 'b')];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

    // Gap center = (0 + 100 + 280) / 2 = 190
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

    // floor-median centering: lane[0] = 190, lane[1] = 190 + 15 = 205
    expect(result.get('e1')).toBe(190);
    expect(result.get('e2')).toBe(205);
  });

  it('globally deduplicates lanes for edges from different sources in same layer (TB)', () => {
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('d', 200, 0),
      makeNode('b', 0, 280),
      makeNode('c', 200, 280),
    ];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'd', 'c')];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

    expect(result.get('e1')).toBe(190);
    expect(result.get('e2')).toBe(205);
    expect(result.get('e1')).not.toBe(result.get('e2'));
  });

  it('handles multi-layer spanning edges (TB)', () => {
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('b', 0, 280),
      makeNode('c', 0, 560),
    ];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'a', 'c')];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

    expect(result.has('e1')).toBe(true);
    expect(result.has('e2')).toBe(true);
    expect(result.get('e1')).not.toBe(result.get('e2'));
  });

  it('assigns lane for straight vertical edge where sourceX === targetX (TB)', () => {
    const nodes = [makeNode('a', 100, 0), makeNode('b', 100, 280)];
    const edges = [makeEdge('e1', 'a', 'b')];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

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

    expect(result.get('e1')).toBe(190);
    expect(result.get('e2')).toBe(210);
  });

  it('sub-sorts by source cross-axis when targets have same X (TB)', () => {
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('d', 200, 0),
      makeNode('b', 100, 280),
      makeNode('c', 100, 280),
    ];
    const edges = [makeEdge('e1', 'd', 'c'), makeEdge('e2', 'a', 'b')];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

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

    // Gap center = (0 + 180 + 400) / 2 = 290
    expect(result.get('e1')).toBe(290);
    expect(result.get('e2')).toBe(305);
  });

  it('assigns single lane at gap center for LR direction', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 400, 0)];
    const edges = [makeEdge('e1', 'a', 'b')];
    const result = computeEdgeRoutes(nodes, edges, 'LR');

    expect(result.get('e1')).toBe(290);
  });

  // --- Floor-median centering ---

  it('odd edge count: median edge lands exactly on gap center', () => {
    const nodes = [
      makeNode('a', 100, 0),
      makeNode('b', 0, 280),
      makeNode('c', 100, 280),
      makeNode('d', 200, 280),
    ];
    const edges = [
      makeEdge('e1', 'a', 'b'),
      makeEdge('e2', 'a', 'c'),
      makeEdge('e3', 'a', 'd'),
    ];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

    // Gap center = (0 + 100 + 280) / 2 = 190
    // 3 edges → mid = 1, lanes: 190-15=175, 190, 190+15=205
    expect(result.get('e1')).toBe(175);
    expect(result.get('e2')).toBe(190);
    expect(result.get('e3')).toBe(205);
  });

  it('even edge count: floor-median edge lands on gap center', () => {
    const nodes = [
      makeNode('a', 100, 0),
      makeNode('b', 0, 280),
      makeNode('c', 100, 280),
      makeNode('d', 200, 280),
      makeNode('e', 300, 280),
    ];
    const edges = [
      makeEdge('e1', 'a', 'b'),
      makeEdge('e2', 'a', 'c'),
      makeEdge('e3', 'a', 'd'),
      makeEdge('e4', 'a', 'e'),
    ];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

    // Gap center = 190, 4 edges → mid = 1
    // lanes: 190-15=175, 190, 190+15=205, 190+30=220
    expect(result.get('e1')).toBe(175);
    expect(result.get('e2')).toBe(190);
    expect(result.get('e3')).toBe(205);
    expect(result.get('e4')).toBe(220);
  });

  // --- Edge cases ---

  it('groups nodes within tolerance into same layer', () => {
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('b', 200, 3),
      makeNode('c', 0, 280),
    ];
    const edges = [makeEdge('e1', 'a', 'c'), makeEdge('e2', 'b', 'c')];
    const result = computeEdgeRoutes(nodes, edges, 'TB');

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

// ---------------------------------------------------------------------------
// computeMaxLanesPerGap
// ---------------------------------------------------------------------------

describe('computeMaxLanesPerGap', () => {
  it('returns 0 for empty graph', () => {
    expect(computeMaxLanesPerGap([], [], 'TB')).toBe(0);
  });

  it('returns 0 when all nodes are in one layer', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 200, 0)];
    const edges = [makeEdge('e1', 'a', 'b')];
    expect(computeMaxLanesPerGap(nodes, edges, 'TB')).toBe(0);
  });

  it('returns 1 for a single inter-layer edge', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 0, 280)];
    const edges = [makeEdge('e1', 'a', 'b')];
    expect(computeMaxLanesPerGap(nodes, edges, 'TB')).toBe(1);
  });

  it('returns correct count for multiple edges in same gap', () => {
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('b', 0, 280),
      makeNode('c', 200, 280),
    ];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'a', 'c')];
    expect(computeMaxLanesPerGap(nodes, edges, 'TB')).toBe(2);
  });

  it('returns the max across all gaps', () => {
    // Gap 0 has 3 edges, gap 1 has 1 edge
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('b', 0, 280),
      makeNode('c', 200, 280),
      makeNode('d', 400, 280),
      makeNode('e', 0, 560),
    ];
    const edges = [
      makeEdge('e1', 'a', 'b'),
      makeEdge('e2', 'a', 'c'),
      makeEdge('e3', 'a', 'd'),
      makeEdge('e4', 'b', 'e'),
    ];
    expect(computeMaxLanesPerGap(nodes, edges, 'TB')).toBe(3);
  });

  it('works with LR direction', () => {
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('b', 400, 0),
      makeNode('c', 400, 200),
    ];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'a', 'c')];
    expect(computeMaxLanesPerGap(nodes, edges, 'LR')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// adjustLayerSpacing
// ---------------------------------------------------------------------------

describe('adjustLayerSpacing', () => {
  it('returns nodes unchanged for empty graph', () => {
    expect(adjustLayerSpacing([], [], 'TB')).toEqual([]);
  });

  it('returns nodes unchanged for single-layer graph', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 200, 0)];
    const result = adjustLayerSpacing(nodes, [], 'TB');
    expect(result).toEqual(nodes);
  });

  it('uses MIN_LAYER_GAP when gap has few edges (TB)', () => {
    // 1 edge: requiredGap = max(100, 1*10 + 2*30) = max(100, 70) = 100
    const nodes = [makeNode('a', 0, 0), makeNode('b', 0, 500)];
    const edges = [makeEdge('e1', 'a', 'b')];
    const result = adjustLayerSpacing(nodes, edges, 'TB');

    // Layer 0 stays at y=0, layer 1 moves to y = 0 + NODE_HEIGHT + 100 = 200
    expect(result[0].position.y).toBe(0);
    expect(result[1].position.y).toBe(200);
  });

  it('expands gap when many edges need space (TB)', () => {
    // 10 edges: requiredGap = max(100, 10*15 + 60) = 210
    const nodes = [makeNode('src', 0, 0)];
    const edges: Edge[] = [];
    for (let i = 0; i < 10; i++) {
      nodes.push(makeNode(`t${i}`, i * 50, 300));
      edges.push(makeEdge(`e${i}`, 'src', `t${i}`));
    }

    const result = adjustLayerSpacing(nodes, edges, 'TB');

    // Layer 1 should be at y = NODE_HEIGHT + 210 = 310
    const targetNode = result.find((n) => n.id === 't0')!;
    expect(targetNode.position.y).toBe(NODE_HEIGHT + 210);
  });

  it('applies per-gap spacing — different gaps get different sizes (TB)', () => {
    // Gap 0: 1 edge → 100px, Gap 1: 5 edges → max(100, 5*15+60) = 135px
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('b', 0, 500),
      makeNode('c0', 0, 1000),
      makeNode('c1', 100, 1000),
      makeNode('c2', 200, 1000),
      makeNode('c3', 300, 1000),
      makeNode('c4', 400, 1000),
    ];
    const edges = [
      makeEdge('e0', 'a', 'b'),
      makeEdge('e1', 'b', 'c0'),
      makeEdge('e2', 'b', 'c1'),
      makeEdge('e3', 'b', 'c2'),
      makeEdge('e4', 'b', 'c3'),
      makeEdge('e5', 'b', 'c4'),
    ];

    const result = adjustLayerSpacing(nodes, edges, 'TB');

    // Layer 0 at y=0
    // Layer 1 at y = 0 + 100 + 100 = 200 (gap 0: 1 edge → 100px min)
    // Layer 2 at y = 200 + 100 + 135 = 435 (gap 1: 5 edges → 135px)
    const nodeB = result.find((n) => n.id === 'b')!;
    const nodeC0 = result.find((n) => n.id === 'c0')!;
    expect(nodeB.position.y).toBe(200);
    expect(nodeC0.position.y).toBe(435);
  });

  it('preserves cross-axis positions (TB)', () => {
    const nodes = [makeNode('a', 50, 0), makeNode('b', 150, 500)];
    const edges = [makeEdge('e1', 'a', 'b')];
    const result = adjustLayerSpacing(nodes, edges, 'TB');

    expect(result[0].position.x).toBe(50);
    expect(result[1].position.x).toBe(150);
  });

  it('adjusts X positions for LR direction', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 500, 0)];
    const edges = [makeEdge('e1', 'a', 'b')];
    const result = adjustLayerSpacing(nodes, edges, 'LR');

    // Layer 1 at x = 0 + NODE_WIDTH(180) + MIN_LAYER_GAP(100) = 280
    expect(result[0].position.x).toBe(0);
    expect(result[1].position.x).toBe(NODE_WIDTH + MIN_LAYER_GAP);
    // Y preserved
    expect(result[0].position.y).toBe(0);
    expect(result[1].position.y).toBe(0);
  });

  it('respects custom lane spacing and padding', () => {
    // 2 edges with laneSpacing=20, padding=50: max(100, 2*20 + 2*50) = max(100, 140) = 140
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('b', 0, 500),
      makeNode('c', 200, 500),
    ];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'a', 'c')];
    const result = adjustLayerSpacing(nodes, edges, 'TB', 20, 50);

    expect(result[0].position.y).toBe(0);
    expect(result[1].position.y).toBe(NODE_HEIGHT + 140);
  });

  it('handles zero-edge gap with MIN_LAYER_GAP', () => {
    // 3 layers, gap 0 has 1 edge, gap 1 has 0 edges
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('b', 0, 500),
      makeNode('c', 0, 1000),
    ];
    const edges = [makeEdge('e1', 'a', 'b')];
    const result = adjustLayerSpacing(nodes, edges, 'TB');

    // Gap 0: 1 edge → 100px (min). Gap 1: 0 edges → 100px (min)
    const nodeB = result.find((n) => n.id === 'b')!;
    const nodeC = result.find((n) => n.id === 'c')!;
    expect(nodeB.position.y).toBe(200);
    expect(nodeC.position.y).toBe(400);
  });
});
