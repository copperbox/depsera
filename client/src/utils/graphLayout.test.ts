import {
  getLayoutedElements,
  transformGraphData,
  computeTopologyFingerprint,
  updateGraphDataOnly,
  isHighLatency,
  NODE_WIDTH,
  NODE_HEIGHT,
  LAYOUT_DIRECTION_KEY,
  EDGE_STYLE_KEY,
  HIGH_LATENCY_FLOOR_MS,
  HIGH_LATENCY_MULTIPLIER,
} from './graphLayout';
import type { AppNode, AppEdge } from './graphLayout';
import type { GraphResponse } from './../types/graph';

// Mock ELK
jest.mock('elkjs/lib/elk.bundled.js', () => {
  return jest.fn().mockImplementation(() => ({
    layout: jest.fn().mockImplementation((graph) => {
      return Promise.resolve({
        ...graph,
        children: graph.children?.map((child: { id: string }, index: number) => ({
          ...child,
          x: index * 200,
          y: index * 150,
        })),
      });
    }),
  }));
});

describe('constants', () => {
  it('exports expected constants', () => {
    expect(NODE_WIDTH).toBe(180);
    expect(NODE_HEIGHT).toBe(100);
    expect(HIGH_LATENCY_FLOOR_MS).toBe(100);
    expect(HIGH_LATENCY_MULTIPLIER).toBe(2);
    expect(LAYOUT_DIRECTION_KEY).toBe('graph-layout-direction');
    expect(EDGE_STYLE_KEY).toBe('graph-edge-style');
  });
});

describe('isHighLatency', () => {
  it('returns false when latencyMs is null or undefined', () => {
    expect(isHighLatency(null, 50)).toBe(false);
    expect(isHighLatency(undefined, 50)).toBe(false);
  });

  it('returns false when avgLatencyMs24h is null, undefined, or zero', () => {
    expect(isHighLatency(200, null)).toBe(false);
    expect(isHighLatency(200, undefined)).toBe(false);
    expect(isHighLatency(200, 0)).toBe(false);
  });

  it('uses absolute floor for fast dependencies (2x avg < floor)', () => {
    // avg=2ms, 2x=4ms, floor=100ms → threshold=100ms
    expect(isHighLatency(99, 2)).toBe(false);
    expect(isHighLatency(101, 2)).toBe(true);
  });

  it('uses absolute floor for moderate dependencies (2x avg < floor)', () => {
    // avg=30ms, 2x=60ms, floor=100ms → threshold=100ms
    expect(isHighLatency(99, 30)).toBe(false);
    expect(isHighLatency(101, 30)).toBe(true);
  });

  it('uses 2x multiplier when 2x avg exceeds floor', () => {
    // avg=80ms, 2x=160ms, floor=100ms → threshold=160ms
    expect(isHighLatency(159, 80)).toBe(false);
    expect(isHighLatency(161, 80)).toBe(true);
  });

  it('uses 2x multiplier for slow dependencies', () => {
    // avg=500ms, 2x=1000ms, floor=100ms → threshold=1000ms
    expect(isHighLatency(999, 500)).toBe(false);
    expect(isHighLatency(1001, 500)).toBe(true);
  });

  it('returns false when latency equals the threshold exactly', () => {
    // avg=100ms, 2x=200ms → threshold=200ms, latency=200ms is NOT high (must exceed)
    expect(isHighLatency(200, 100)).toBe(false);
  });

  it('returns false for latencyMs of 0', () => {
    expect(isHighLatency(0, 50)).toBe(false);
  });
});

describe('getLayoutedElements', () => {
  const nodes: AppNode[] = [
    {
      id: 'node-1',
      type: 'service',
      position: { x: 0, y: 0 },
      data: {
        name: 'Service A',
        teamId: 't1',
        teamName: 'Team A',
        healthEndpoint: '/health',
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
    },
    {
      id: 'node-2',
      type: 'service',
      position: { x: 0, y: 0 },
      data: {
        name: 'Service B',
        teamId: 't1',
        teamName: 'Team A',
        healthEndpoint: '/health',
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
    },
  ];

  const edges: AppEdge[] = [
    {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      type: 'custom',
      data: { relationship: 'depends_on' },
    },
  ];

  it('applies layout to nodes with default TB direction', async () => {
    const result = await getLayoutedElements(nodes, edges);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].position.x).toBe(0);
    expect(result.nodes[0].position.y).toBe(0);
    expect(result.nodes[1].position.x).toBe(200);
    // ELK places at y=150, adjustLayerSpacing moves to y=200 (NODE_HEIGHT + MIN_LAYER_GAP)
    expect(result.nodes[1].position.y).toBe(200);

    // Edges should have routing data attached
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].data!.routingLane).toEqual(expect.any(Number));
    expect(result.edges[0].data!.layoutDirection).toBe('TB');
    expect(result.edges[0].data!.edgeStyle).toBe('orthogonal');
  });

  it('applies layout with LR direction', async () => {
    const result = await getLayoutedElements(nodes, edges, 'LR');

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].data!.routingLane).toEqual(expect.any(Number));
    expect(result.edges[0].data!.layoutDirection).toBe('LR');
  });

  it('applies layout with orthogonal edge style (default)', async () => {
    const result = await getLayoutedElements(nodes, edges, 'TB', 'orthogonal');

    expect(result.nodes).toHaveLength(2);
    expect(result.edges[0].data!.edgeStyle).toBe('orthogonal');
    expect(result.edges[0].data!.routingLane).toEqual(expect.any(Number));
  });

  it('applies layout with bezier edge style (skips routing lanes)', async () => {
    const result = await getLayoutedElements(nodes, edges, 'TB', 'bezier');

    expect(result.nodes).toHaveLength(2);
    expect(result.edges[0].data!.edgeStyle).toBe('bezier');
    expect(result.edges[0].data!.routingLane).toBeNull();
  });

  it('handles empty nodes list', async () => {
    const result = await getLayoutedElements([], []);

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

});

describe('transformGraphData', () => {
  const graphResponse: GraphResponse = {
    nodes: [
      {
        id: 'node-1',
        type: 'service',
        data: {
          name: 'Service A',
          teamId: 't1',
          teamName: 'Team A',
          healthEndpoint: '/health',
          isActive: true,
          dependencyCount: 1,
          healthyCount: 1,
          unhealthyCount: 0,
          lastPollSuccess: true,
          lastPollError: null,
          skippedCount: 0,
          reportedHealthyCount: 0,
          reportedUnhealthyCount: 0,
        },
      },
      {
        id: 'node-2',
        type: 'service',
        data: {
          name: 'Service B',
          teamId: 't1',
          teamName: 'Team A',
          healthEndpoint: '/health',
          isActive: true,
          dependencyCount: 0,
          healthyCount: 0,
          unhealthyCount: 0,
          lastPollSuccess: true,
          lastPollError: null,
          skippedCount: 0,
          reportedHealthyCount: 0,
          reportedUnhealthyCount: 0,
        },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'node-2',
        target: 'node-1',
        data: {
          relationship: 'depends_on',
          healthy: true,
          latencyMs: 50,
        },
      },
    ],
  };

  it('transforms graph response to ReactFlow format', async () => {
    const result = await transformGraphData(graphResponse);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].type).toBe('service');
    expect(result.nodes[0].data.layoutDirection).toBe('TB');

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].type).toBe('custom');
    expect(result.edges[0].animated).toBeUndefined();
  });

  it('calculates reported health counts from edges', async () => {
    const result = await transformGraphData(graphResponse);

    // node-2 is the source of an edge with healthy=true, so it should have reportedHealthyCount=1
    const node2 = result.nodes.find((n) => n.id === 'node-2');
    expect(node2?.data.reportedHealthyCount).toBe(1);
    expect(node2?.data.reportedUnhealthyCount).toBe(0);

    // node-1 has no incoming edges (it's the target), so no reported health
    const node1 = result.nodes.find((n) => n.id === 'node-1');
    expect(node1?.data.reportedHealthyCount).toBe(0);
    expect(node1?.data.reportedUnhealthyCount).toBe(0);
  });

  it('counts unhealthy reports', async () => {
    const unhealthyResponse: GraphResponse = {
      ...graphResponse,
      edges: [
        {
          id: 'edge-1',
          source: 'node-2',
          target: 'node-1',
          data: {
            relationship: 'depends_on',
            healthy: false,
          },
        },
      ],
    };

    const result = await transformGraphData(unhealthyResponse);

    const node2 = result.nodes.find((n) => n.id === 'node-2');
    expect(node2?.data.reportedHealthyCount).toBe(0);
    expect(node2?.data.reportedUnhealthyCount).toBe(1);
  });

  it('handles null healthy value in edges', async () => {
    const nullHealthyResponse: GraphResponse = {
      ...graphResponse,
      edges: [
        {
          id: 'edge-1',
          source: 'node-2',
          target: 'node-1',
          data: {
            relationship: 'depends_on',
            healthy: null,
          },
        },
      ],
    };

    const result = await transformGraphData(nullHealthyResponse);

    const node2 = result.nodes.find((n) => n.id === 'node-2');
    expect(node2?.data.reportedHealthyCount).toBe(0);
    expect(node2?.data.reportedUnhealthyCount).toBe(0);
  });

  it('applies custom direction and edge style', async () => {
    const result = await transformGraphData(graphResponse, 'LR', 'bezier');

    expect(result.nodes[0].data.layoutDirection).toBe('LR');
    expect(result.edges[0].data!.edgeStyle).toBe('bezier');
  });
});

describe('computeTopologyFingerprint', () => {
  it('produces a deterministic fingerprint from node IDs and edges', () => {
    const data: GraphResponse = {
      nodes: [
        { id: 'b', type: 'service', data: {} as never },
        { id: 'a', type: 'service', data: {} as never },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b', data: { relationship: 'depends_on' } },
      ],
    };

    const fingerprint = computeTopologyFingerprint(data);
    expect(fingerprint).toBe('a,b|a->b');
  });

  it('produces the same fingerprint regardless of node/edge order', () => {
    const data1: GraphResponse = {
      nodes: [
        { id: 'a', type: 'service', data: {} as never },
        { id: 'b', type: 'service', data: {} as never },
      ],
      edges: [
        { id: 'e1', source: 'b', target: 'a', data: { relationship: 'depends_on' } },
        { id: 'e2', source: 'a', target: 'b', data: { relationship: 'depends_on' } },
      ],
    };

    const data2: GraphResponse = {
      nodes: [
        { id: 'b', type: 'service', data: {} as never },
        { id: 'a', type: 'service', data: {} as never },
      ],
      edges: [
        { id: 'e2', source: 'a', target: 'b', data: { relationship: 'depends_on' } },
        { id: 'e1', source: 'b', target: 'a', data: { relationship: 'depends_on' } },
      ],
    };

    expect(computeTopologyFingerprint(data1)).toBe(computeTopologyFingerprint(data2));
  });

  it('produces different fingerprints for different topologies', () => {
    const data1: GraphResponse = {
      nodes: [
        { id: 'a', type: 'service', data: {} as never },
        { id: 'b', type: 'service', data: {} as never },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b', data: { relationship: 'depends_on' } },
      ],
    };

    const data2: GraphResponse = {
      nodes: [
        { id: 'a', type: 'service', data: {} as never },
        { id: 'b', type: 'service', data: {} as never },
        { id: 'c', type: 'service', data: {} as never },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b', data: { relationship: 'depends_on' } },
      ],
    };

    expect(computeTopologyFingerprint(data1)).not.toBe(computeTopologyFingerprint(data2));
  });

  it('handles empty graph data', () => {
    const data: GraphResponse = { nodes: [], edges: [] };
    expect(computeTopologyFingerprint(data)).toBe('|');
  });
});

describe('updateGraphDataOnly', () => {
  const existingNodes: AppNode[] = [
    {
      id: 'node-1',
      type: 'service',
      position: { x: 100, y: 200 },
      data: {
        name: 'Service A',
        teamId: 't1',
        teamName: 'Team A',
        healthEndpoint: '/health',
        isActive: true,
        dependencyCount: 1,
        healthyCount: 1,
        unhealthyCount: 0,
        lastPollSuccess: true,
        lastPollError: null,
        skippedCount: 0,
        reportedHealthyCount: 0,
        reportedUnhealthyCount: 0,
        layoutDirection: 'TB',
      },
    },
    {
      id: 'node-2',
      type: 'service',
      position: { x: 300, y: 400 },
      data: {
        name: 'Service B',
        teamId: 't1',
        teamName: 'Team A',
        healthEndpoint: '/health',
        isActive: true,
        dependencyCount: 0,
        healthyCount: 0,
        unhealthyCount: 0,
        lastPollSuccess: true,
        lastPollError: null,
        skippedCount: 0,
        reportedHealthyCount: 1,
        reportedUnhealthyCount: 0,
        layoutDirection: 'TB',
      },
    },
  ];

  const existingEdges: AppEdge[] = [
    {
      id: 'edge-1',
      source: 'node-2',
      target: 'node-1',
      type: 'custom',
      data: {
        relationship: 'depends_on',
        healthy: true,
        latencyMs: 50,
        routingLane: 1,
        layoutDirection: 'TB',
        edgeStyle: 'orthogonal',
      },
    },
  ];

  it('preserves node positions while updating data', () => {
    const newData: GraphResponse = {
      nodes: [
        {
          id: 'node-1',
          type: 'service',
          data: {
            name: 'Service A',
            teamId: 't1',
            teamName: 'Team A',
            healthEndpoint: '/health',
            isActive: true,
            dependencyCount: 1,
            healthyCount: 0,
            unhealthyCount: 1,
            lastPollSuccess: false,
            lastPollError: 'timeout',
            skippedCount: 0,
            reportedHealthyCount: 0,
            reportedUnhealthyCount: 0,
          },
        },
        {
          id: 'node-2',
          type: 'service',
          data: {
            name: 'Service B',
            teamId: 't1',
            teamName: 'Team A',
            healthEndpoint: '/health',
            isActive: true,
            dependencyCount: 0,
            healthyCount: 0,
            unhealthyCount: 0,
            lastPollSuccess: true,
            lastPollError: null,
            skippedCount: 0,
            reportedHealthyCount: 0,
            reportedUnhealthyCount: 0,
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'node-2',
          target: 'node-1',
          data: {
            relationship: 'depends_on',
            healthy: false,
            latencyMs: 120,
          },
        },
      ],
    };

    const result = updateGraphDataOnly(existingNodes, existingEdges, newData);

    // Positions should be preserved
    expect(result.nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(result.nodes[1].position).toEqual({ x: 300, y: 400 });

    // Data should be updated
    expect(result.nodes[0].data.unhealthyCount).toBe(1);
    expect(result.nodes[0].data.lastPollSuccess).toBe(false);
    expect(result.nodes[0].data.lastPollError).toBe('timeout');
  });

  it('recalculates reported health counts from edges', () => {
    const newData: GraphResponse = {
      nodes: existingNodes.map(n => ({ id: n.id, type: 'service' as const, data: n.data })),
      edges: [
        {
          id: 'edge-1',
          source: 'node-2',
          target: 'node-1',
          data: { relationship: 'depends_on', healthy: false },
        },
      ],
    };

    const result = updateGraphDataOnly(existingNodes, existingEdges, newData);

    // node-2 is source of edge with healthy=false
    const node2 = result.nodes.find(n => n.id === 'node-2');
    expect(node2?.data.reportedHealthyCount).toBe(0);
    expect(node2?.data.reportedUnhealthyCount).toBe(1);

    // node-1 is target, no reported health
    const node1 = result.nodes.find(n => n.id === 'node-1');
    expect(node1?.data.reportedHealthyCount).toBe(0);
    expect(node1?.data.reportedUnhealthyCount).toBe(0);
  });

  it('preserves edge routing while updating edge data', () => {
    const newData: GraphResponse = {
      nodes: existingNodes.map(n => ({ id: n.id, type: 'service' as const, data: n.data })),
      edges: [
        {
          id: 'edge-1',
          source: 'node-2',
          target: 'node-1',
          data: { relationship: 'depends_on', healthy: false, latencyMs: 200 },
        },
      ],
    };

    const result = updateGraphDataOnly(existingNodes, existingEdges, newData);

    // Edge routing should be preserved (from existing edge data)
    expect(result.edges[0].data!.routingLane).toBe(1);
    expect(result.edges[0].data!.layoutDirection).toBe('TB');
    expect(result.edges[0].data!.edgeStyle).toBe('orthogonal');

    // Edge data should be updated
    expect(result.edges[0].data!.healthy).toBe(false);
    expect(result.edges[0].data!.latencyMs).toBe(200);
  });

  it('returns existing node if not found in new data', () => {
    const newData: GraphResponse = {
      nodes: [
        {
          id: 'node-1',
          type: 'service',
          data: existingNodes[0].data,
        },
        // node-2 is missing from new data
      ],
      edges: [],
    };

    const result = updateGraphDataOnly(existingNodes, existingEdges, newData);

    // node-2 should remain unchanged
    expect(result.nodes[1]).toBe(existingNodes[1]);
  });

  it('returns existing edge if not found in new data', () => {
    const newData: GraphResponse = {
      nodes: existingNodes.map(n => ({ id: n.id, type: 'service' as const, data: n.data })),
      edges: [], // edge-1 is missing from new data
    };

    const result = updateGraphDataOnly(existingNodes, existingEdges, newData);

    // edge should remain unchanged
    expect(result.edges[0]).toBe(existingEdges[0]);
  });

  it('applies custom layout direction to node data', () => {
    const newData: GraphResponse = {
      nodes: existingNodes.map(n => ({ id: n.id, type: 'service' as const, data: n.data })),
      edges: [
        {
          id: 'edge-1',
          source: 'node-2',
          target: 'node-1',
          data: { relationship: 'depends_on', healthy: true },
        },
      ],
    };

    const result = updateGraphDataOnly(existingNodes, existingEdges, newData, 'LR');

    expect(result.nodes[0].data.layoutDirection).toBe('LR');
    expect(result.nodes[1].data.layoutDirection).toBe('LR');
  });
});
