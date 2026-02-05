import {
  getLayoutedElements,
  transformGraphData,
  NODE_WIDTH,
  NODE_HEIGHT,
  DEFAULT_TIER_SPACING,
  LAYOUT_DIRECTION_KEY,
  TIER_SPACING_KEY,
  LATENCY_THRESHOLD_KEY,
  MIN_TIER_SPACING,
  MAX_TIER_SPACING,
  DEFAULT_LATENCY_THRESHOLD,
  MIN_LATENCY_THRESHOLD,
  MAX_LATENCY_THRESHOLD,
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
    expect(DEFAULT_TIER_SPACING).toBe(180);
    expect(MIN_TIER_SPACING).toBe(80);
    expect(MAX_TIER_SPACING).toBe(400);
    expect(DEFAULT_LATENCY_THRESHOLD).toBe(50);
    expect(MIN_LATENCY_THRESHOLD).toBe(10);
    expect(MAX_LATENCY_THRESHOLD).toBe(200);
    expect(LAYOUT_DIRECTION_KEY).toBe('graph-layout-direction');
    expect(TIER_SPACING_KEY).toBe('graph-tier-spacing');
    expect(LATENCY_THRESHOLD_KEY).toBe('graph-latency-threshold');
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
    expect(result.nodes[1].position.y).toBe(150);
    expect(result.edges).toEqual(edges);
  });

  it('applies layout with LR direction', async () => {
    const result = await getLayoutedElements(nodes, edges, 'LR');

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toEqual(edges);
  });

  it('applies layout with custom tier spacing', async () => {
    const result = await getLayoutedElements(nodes, edges, 'TB', 300);

    expect(result.nodes).toHaveLength(2);
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
    expect(result.edges[0].animated).toBe(true);
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

  it('applies custom direction and tier spacing', async () => {
    const result = await transformGraphData(graphResponse, 'LR', 250);

    expect(result.nodes[0].data.layoutDirection).toBe('LR');
  });
});
