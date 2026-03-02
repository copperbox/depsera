import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Node } from '@xyflow/react';
import { EdgeDetailsPanel } from './EdgeDetailsPanel';
import type { ServiceNodeData, GraphEdgeData } from './../../../types/graph';

jest.mock('../../Charts/LatencyChart', () => ({
  LatencyChart: ({ dependencyId }: { dependencyId: string }) => (
    <div data-testid="latency-chart">Latency Chart: {dependencyId}</div>
  ),
}));

type AppNode = Node<ServiceNodeData, 'service'>;

const mockSourceNode: AppNode = {
  id: 's1',
  type: 'service',
  position: { x: 0, y: 0 },
  data: {
    name: 'Source Service',
    teamName: 'Team Alpha',
    teamId: 't1',
    healthyCount: 3,
    unhealthyCount: 0,
    dependencyCount: 3,
    healthEndpoint: 'https://example.com/health',
    isActive: true,
    lastPollSuccess: true,
    lastPollError: null,
    reportedHealthyCount: 2,
    reportedUnhealthyCount: 0,
    skippedCount: 0,
    layoutDirection: 'TB',
  },
};

const mockTargetNode: AppNode = {
  id: 's2',
  type: 'service',
  position: { x: 100, y: 0 },
  data: {
    name: 'Target Service',
    teamName: 'Team Beta',
    teamId: 't2',
    healthyCount: 2,
    unhealthyCount: 1,
    dependencyCount: 3,
    healthEndpoint: 'https://example.com/health2',
    isActive: true,
    lastPollSuccess: true,
    lastPollError: null,
    reportedHealthyCount: 1,
    reportedUnhealthyCount: 1,
    skippedCount: 0,
    layoutDirection: 'TB',
  },
};

const mockEdgeData: GraphEdgeData = {
  relationship: 'depends_on',
  dependencyId: 'd1',
  dependencyName: 'Database Connection',
  healthy: true,
  latencyMs: 25,
  avgLatencyMs24h: 20,
};

function renderPanel(
  edgeId = 'e1',
  data = mockEdgeData,
  sourceNode: AppNode | undefined = mockSourceNode,
  targetNode: AppNode | undefined = mockTargetNode,
  onClose = jest.fn()
) {
  return render(
    <MemoryRouter>
      <EdgeDetailsPanel
        edgeId={edgeId}
        data={data}
        sourceNode={sourceNode}
        targetNode={targetNode}
        onClose={onClose}
      />
    </MemoryRouter>
  );
}

describe('EdgeDetailsPanel', () => {
  it('renders source node name as title', async () => {
    renderPanel();

    // Title uses source node name as fallback when no canonical name
    expect(screen.getByRole('heading', { name: 'Source Service' })).toBeInTheDocument();
  });

  it('displays healthy status', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Healthy')).toBeInTheDocument();
    });
  });

  it('displays critical status for unhealthy edge', async () => {
    const unhealthyData = { ...mockEdgeData, healthy: false };

    renderPanel('e1', unhealthyData);

    await waitFor(() => {
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });
  });

  it('displays high latency badge', async () => {
    const highLatencyData = { ...mockEdgeData, isHighLatency: true };

    renderPanel('e1', highLatencyData);

    await waitFor(() => {
      expect(screen.getByText('High Latency')).toBeInTheDocument();
    });
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = jest.fn();

    renderPanel('e1', mockEdgeData, mockSourceNode, mockTargetNode, onClose);

    fireEvent.click(screen.getByLabelText('Close panel'));

    expect(onClose).toHaveBeenCalled();
  });

  it('displays connection flow with source and target', async () => {
    renderPanel();

    expect(screen.getByText('From')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Source Service' })).toBeInTheDocument();
    expect(screen.getByText('To')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Target Service' })).toBeInTheDocument();
  });

  it('shows Unknown for missing source node', async () => {
    render(
      <MemoryRouter>
        <EdgeDetailsPanel
          edgeId="e1"
          data={mockEdgeData}
          sourceNode={undefined}
          targetNode={mockTargetNode}
          onClose={jest.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  it('shows Unknown for missing target node', async () => {
    render(
      <MemoryRouter>
        <EdgeDetailsPanel
          edgeId="e1"
          data={mockEdgeData}
          sourceNode={mockSourceNode}
          targetNode={undefined}
          onClose={jest.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
    });
  });

  it('renders latency chart when dependencyId is present', async () => {
    renderPanel();

    expect(screen.getByTestId('latency-chart')).toBeInTheDocument();
    expect(screen.getByText('Latency Chart: d1')).toBeInTheDocument();
  });

  it('does not render latency chart when no dependencyId', async () => {
    const noIdData = { ...mockEdgeData, dependencyId: undefined };

    renderPanel('e1', noIdData);

    expect(screen.queryByTestId('latency-chart')).not.toBeInTheDocument();
  });

  it('displays contact section when effectiveContact is present', async () => {
    const dataWithContact = {
      ...mockEdgeData,
      effectiveContact: '{"email":"team@example.com","slack":"#team-channel"}',
    };

    renderPanel('e1', dataWithContact);

    expect(screen.getByTestId('contact-section')).toBeInTheDocument();
    expect(screen.getByText('email')).toBeInTheDocument();
    expect(screen.getByText('team@example.com')).toBeInTheDocument();
    expect(screen.getByText('slack')).toBeInTheDocument();
    expect(screen.getByText('#team-channel')).toBeInTheDocument();
  });

  it('does not display contact section when effectiveContact is null', async () => {
    renderPanel();

    expect(screen.queryByTestId('contact-section')).not.toBeInTheDocument();
  });

  it('does not display contact section for invalid JSON', async () => {
    const dataWithBadContact = {
      ...mockEdgeData,
      effectiveContact: 'not valid json',
    };

    renderPanel('e1', dataWithBadContact);

    expect(screen.queryByTestId('contact-section')).not.toBeInTheDocument();
  });

  it('does not display contact section for array JSON', async () => {
    const dataWithArrayContact = {
      ...mockEdgeData,
      effectiveContact: '["email@example.com"]',
    };

    renderPanel('e1', dataWithArrayContact);

    expect(screen.queryByTestId('contact-section')).not.toBeInTheDocument();
  });

  it('displays impact section when present', async () => {
    const dataWithImpact = { ...mockEdgeData, impact: 'Service degradation expected' };

    renderPanel('e1', dataWithImpact);

    await waitFor(() => {
      expect(screen.getByText('Impact')).toBeInTheDocument();
      expect(screen.getByText('Service degradation expected')).toBeInTheDocument();
    });
  });

  it('displays dependency type', async () => {
    const dataWithType = { ...mockEdgeData, dependencyType: 'database' as const };

    renderPanel('e1', dataWithType);

    await waitFor(() => {
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('database')).toBeInTheDocument();
    });
  });

  it('displays association type', async () => {
    const dataWithAssociation = { ...mockEdgeData, dependencyType: 'rest' as const, associationType: 'message_queue' as const };

    renderPanel('e1', dataWithAssociation);

    await waitFor(() => {
      expect(screen.getByText('Association')).toBeInTheDocument();
      expect(screen.getByText('message queue')).toBeInTheDocument();
    });
  });

  it('displays error alert section', async () => {
    const dataWithError = { ...mockEdgeData, errorMessage: 'Connection refused' };

    renderPanel('e1', dataWithError);

    await waitFor(() => {
      expect(screen.getByText('Error Detected')).toBeInTheDocument();
      expect(screen.getByText('Connection refused')).toBeInTheDocument();
    });
  });

  it('toggles error details', async () => {
    const dataWithErrorDetails = { ...mockEdgeData, error: { code: 'ECONNREFUSED', port: 5432 } };

    renderPanel('e1', dataWithErrorDetails);

    await waitFor(() => {
      expect(screen.getByText('Show error details')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Show error details'));

    expect(screen.getByText('Hide error details')).toBeInTheDocument();
    expect(screen.getByText(/ECONNREFUSED/)).toBeInTheDocument();
  });

  it('displays error as string', async () => {
    const dataWithStringError = { ...mockEdgeData, error: 'Simple error string' };

    renderPanel('e1', dataWithStringError);

    await waitFor(() => {
      expect(screen.getByText('Show error details')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Show error details'));

    expect(screen.getByText('Simple error string')).toBeInTheDocument();
  });

  it('displays check details section', async () => {
    const dataWithCheckDetails = {
      ...mockEdgeData,
      checkDetails: { status: 'ok', responseTime: 150 },
    };

    renderPanel('e1', dataWithCheckDetails);

    await waitFor(() => {
      expect(screen.getByText('Check Details')).toBeInTheDocument();
      expect(screen.getByText('status')).toBeInTheDocument();
      expect(screen.getByText('ok')).toBeInTheDocument();
      expect(screen.getByText('responseTime')).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();
    });
  });

  it('formats check detail object values', async () => {
    const dataWithObjectCheckDetail = {
      ...mockEdgeData,
      checkDetails: { nested: { key: 'value' } },
    };

    renderPanel('e1', dataWithObjectCheckDetail);

    await waitFor(() => {
      expect(screen.getByText('nested')).toBeInTheDocument();
      expect(screen.getByText('{"key":"value"}')).toBeInTheDocument();
    });
  });

  it('formats check detail null values', async () => {
    const dataWithNullDetail = {
      ...mockEdgeData,
      checkDetails: { optional: null },
    };

    renderPanel('e1', dataWithNullDetail);

    await waitFor(() => {
      expect(screen.getByText('optional')).toBeInTheDocument();
      expect(screen.getAllByText('-').length).toBeGreaterThan(0);
    });
  });

  it('displays View Error History button', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('View Error History (24h)')).toBeInTheDocument();
    });
  });

  it('switches to error history view', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('View Error History (24h)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('View Error History (24h)'));

    expect(screen.getByText('Error History')).toBeInTheDocument();
  });

  it('displays View Service Details link when target node exists', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('View Service Details')).toBeInTheDocument();
    });
  });

  it('hides View Service Details when no target node', async () => {
    render(
      <MemoryRouter>
        <EdgeDetailsPanel
          edgeId="e1"
          data={mockEdgeData}
          sourceNode={mockSourceNode}
          targetNode={undefined}
          onClose={jest.fn()}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Source Service' })).toBeInTheDocument();
    });

    expect(screen.queryByText('View Service Details')).not.toBeInTheDocument();
  });

  it('displays canonical name over dependency name when present', async () => {
    const dataWithCanonical = { ...mockEdgeData, canonicalName: 'PostgreSQL' };

    renderPanel('e1', dataWithCanonical);

    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.queryByText('Database Connection')).not.toBeInTheDocument();
  });

  it('falls back to source node name when canonical name is null', async () => {
    const dataWithNullCanonical = { ...mockEdgeData, canonicalName: null };

    renderPanel('e1', dataWithNullCanonical);

    // sourceNode.data.name is "Source Service"
    expect(screen.getByRole('heading', { name: 'Source Service' })).toBeInTheDocument();
  });

  it('falls back to dependency name when no canonical name and no source node', async () => {
    const dataWithNullCanonical = { ...mockEdgeData, canonicalName: null };

    render(
      <MemoryRouter>
        <EdgeDetailsPanel
          edgeId="e1"
          data={dataWithNullCanonical}
          sourceNode={undefined}
          targetNode={mockTargetNode}
          onClose={jest.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Database Connection' })).toBeInTheDocument();
  });

  it('falls back to Connection when no names available', async () => {
    const noNameData = { ...mockEdgeData, dependencyName: undefined };

    render(
      <MemoryRouter>
        <EdgeDetailsPanel
          edgeId="e1"
          data={noNameData}
          sourceNode={undefined}
          targetNode={mockTargetNode}
          onClose={jest.fn()}
        />
      </MemoryRouter>
    );

    // "Connection" appears both in the title and as a section title
    const connectionElements = screen.getAllByText('Connection');
    expect(connectionElements.length).toBe(2);
  });

  it('hides error history button when no dependencyId', async () => {
    const noIdData = { ...mockEdgeData, dependencyId: undefined };

    renderPanel('e1', noIdData);

    expect(screen.queryByText('View Error History (24h)')).not.toBeInTheDocument();
  });
});
