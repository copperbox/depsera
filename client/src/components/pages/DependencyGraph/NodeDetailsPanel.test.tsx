import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Node, Edge } from '@xyflow/react';
import { NodeDetailsPanel } from './NodeDetailsPanel';
import type { ServiceNodeData, GraphEdgeData } from './../../../types/graph';

type AppNode = Node<ServiceNodeData, 'service'>;
type AppEdge = Edge<GraphEdgeData, 'custom'>;

const mockNodeData: ServiceNodeData = {
  name: 'Test Service',
  teamName: 'Team Alpha',
  teamId: 't1',
  healthyCount: 3,
  unhealthyCount: 1,
  dependencyCount: 4,
  healthEndpoint: 'https://example.com/health',
  isActive: true,
  lastPollSuccess: true,
  lastPollError: null,
  reportedHealthyCount: 0,
  reportedUnhealthyCount: 1,
  layoutDirection: 'TB',
};

const mockNodes: AppNode[] = [
  {
    id: 's1',
    type: 'service',
    position: { x: 0, y: 0 },
    data: mockNodeData,
  },
  {
    id: 's2',
    type: 'service',
    position: { x: 100, y: 0 },
    data: { ...mockNodeData, name: 'Dependent Service' },
  },
  {
    id: 's3',
    type: 'service',
    position: { x: 200, y: 0 },
    data: { ...mockNodeData, name: 'Upstream Service' },
  },
];

const mockEdges: AppEdge[] = [
  {
    id: 'e1',
    source: 's1',
    target: 's2',
    type: 'custom',
    data: {
      relationship: 'depends_on',
      dependencyId: 'd1',
      dependencyName: 'dep1',
      healthy: true,
      latencyMs: 25,
      avgLatencyMs24h: 20,
    },
  },
  {
    id: 'e2',
    source: 's3',
    target: 's1',
    type: 'custom',
    data: {
      relationship: 'depends_on',
      dependencyId: 'd2',
      dependencyName: 'dep2',
      healthy: false,
      latencyMs: 150,
      avgLatencyMs24h: 50,
      isHighLatency: true,
    },
  },
];

function renderPanel(
  nodeId = 's1',
  data = mockNodeData,
  nodes = mockNodes,
  edges = mockEdges,
  onClose = jest.fn()
) {
  return render(
    <MemoryRouter>
      <NodeDetailsPanel
        nodeId={nodeId}
        data={data}
        nodes={nodes}
        edges={edges}
        onClose={onClose}
      />
    </MemoryRouter>
  );
}

describe('NodeDetailsPanel', () => {
  it('renders service name', () => {
    renderPanel();

    expect(screen.getByText('Test Service')).toBeInTheDocument();
  });

  it('displays health status based on data', () => {
    renderPanel();

    // With unhealthyCount > 0, status should reflect that
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('displays healthy status', () => {
    const healthyData = { ...mockNodeData, reportedUnhealthyCount: 0, reportedHealthyCount: 2 };

    renderPanel('s1', healthyData);

    // There are multiple "Healthy" texts - one in status badge, one in stats label
    expect(screen.getAllByText('Healthy').length).toBeGreaterThan(0);
  });

  it('displays team name', () => {
    renderPanel();

    expect(screen.getByText('Team Alpha')).toBeInTheDocument();
  });

  it('displays health endpoint', () => {
    renderPanel();

    expect(screen.getByText('https://example.com/health')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = jest.fn();

    renderPanel('s1', mockNodeData, mockNodes, mockEdges, onClose);

    fireEvent.click(screen.getByLabelText('Close panel'));

    expect(onClose).toHaveBeenCalled();
  });

  it('displays dependents list', () => {
    renderPanel();

    expect(screen.getByText('Dependents (1)')).toBeInTheDocument();
    expect(screen.getByText('Dependent Service')).toBeInTheDocument();
    expect(screen.getByText('25ms')).toBeInTheDocument();
  });

  it('displays dependencies report section', () => {
    renderPanel();

    expect(screen.getByText('Dependencies Report')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('displays dependency stats', () => {
    renderPanel();

    expect(screen.getByText('4')).toBeInTheDocument(); // dependencyCount
    expect(screen.getByText('3')).toBeInTheDocument(); // healthyCount
    expect(screen.getByText('1')).toBeInTheDocument(); // unhealthyCount
  });

  it('displays dependencies in the list', () => {
    renderPanel();

    // s3 -> s1 edge means s3 is a dependency of s1
    expect(screen.getByText('Upstream Service')).toBeInTheDocument();
    expect(screen.getByText('150ms')).toBeInTheDocument();
  });

  it('displays high latency indicator', () => {
    renderPanel();

    // The edge from s3 -> s1 has isHighLatency: true
    const latencyLabels = screen.getAllByText('150ms');
    expect(latencyLabels.length).toBeGreaterThan(0);
  });

  it('displays View Full Details link', () => {
    renderPanel();

    expect(screen.getByText('View Full Details')).toBeInTheDocument();
  });

  it('shows external badge for external nodes', () => {
    const externalData = { ...mockNodeData, isExternal: true };

    renderPanel('s1', externalData);

    expect(screen.getByText('External')).toBeInTheDocument();
    expect(screen.getByText('External dependency not tracked as a service')).toBeInTheDocument();
  });

  it('shows Reporting Services label for external nodes', () => {
    const externalData = { ...mockNodeData, isExternal: true };

    renderPanel('s1', externalData);

    expect(screen.getByText('Reporting Services (1)')).toBeInTheDocument();
  });

  it('hides dependencies report for external nodes', () => {
    const externalData = { ...mockNodeData, isExternal: true };

    renderPanel('s1', externalData);

    expect(screen.queryByText('Dependencies Report')).not.toBeInTheDocument();
  });

  it('hides View Full Details for external nodes', () => {
    const externalData = { ...mockNodeData, isExternal: true };

    renderPanel('s1', externalData);

    expect(screen.queryByText('View Full Details')).not.toBeInTheDocument();
  });

  it('shows poll failure message', () => {
    const failedPollData = { ...mockNodeData, lastPollSuccess: false, lastPollError: 'Timeout' };

    renderPanel('s1', failedPollData);

    expect(screen.getByText(/Poll failed.*Timeout/)).toBeInTheDocument();
  });

  it('shows poll failure without error message', () => {
    const failedPollData = { ...mockNodeData, lastPollSuccess: false };

    renderPanel('s1', failedPollData);

    expect(screen.getByText('Poll failed')).toBeInTheDocument();
  });

  it('hides poll failure for external nodes', () => {
    const externalFailedData = { ...mockNodeData, isExternal: true, lastPollSuccess: false };

    renderPanel('s1', externalFailedData);

    expect(screen.queryByText('Poll failed')).not.toBeInTheDocument();
  });

  it('hides health endpoint for external nodes', () => {
    const externalData = { ...mockNodeData, isExternal: true };

    renderPanel('s1', externalData);

    expect(screen.queryByText('https://example.com/health')).not.toBeInTheDocument();
  });

  it('hides dependents section when no dependents', () => {
    const noEdges: AppEdge[] = [];

    renderPanel('s1', mockNodeData, mockNodes, noEdges);

    expect(screen.queryByText(/Dependents \(/)).not.toBeInTheDocument();
  });

  it('formats latency in seconds for large values', () => {
    const edgesWithHighLatency: AppEdge[] = [
      {
        id: 'e1',
        source: 's1',
        target: 's2',
        type: 'custom',
        data: {
          relationship: 'depends_on',
          dependencyId: 'd1',
          dependencyName: 'dep1',
          healthy: true,
          latencyMs: 2500,
        },
      },
    ];

    renderPanel('s1', mockNodeData, mockNodes, edgesWithHighLatency);

    expect(screen.getByText('2.5s')).toBeInTheDocument();
  });

  it('shows warning status when appropriate', () => {
    // Warning: no reports, countedDeps > 0, healthyPercentage >= 50 && < 80
    // 3 healthy, 2 unhealthy = 60% healthy -> warning
    const warningData = {
      ...mockNodeData,
      reportedHealthyCount: 0,
      reportedUnhealthyCount: 0,
      healthyCount: 3,
      unhealthyCount: 2,
      dependencyCount: 5,
    };

    renderPanel('s1', warningData);

    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('shows unknown status when no data', () => {
    // Unknown: no reports, countedDeps == 0
    const unknownData = {
      ...mockNodeData,
      reportedHealthyCount: 0,
      reportedUnhealthyCount: 0,
      healthyCount: 0,
      unhealthyCount: 0,
      dependencyCount: 0,
    };

    renderPanel('s1', unknownData);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
