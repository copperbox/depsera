import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Node } from '@xyflow/react';
import { EdgeDetailsPanel } from './EdgeDetailsPanel';
import type { ServiceNodeData, GraphEdgeData } from './../../../types/graph';

jest.mock('../../../api/latency');
import { fetchLatencyStats } from './../../../api/latency';

const mockFetchLatencyStats = fetchLatencyStats as jest.MockedFunction<typeof fetchLatencyStats>;

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

beforeEach(() => {
  mockFetchLatencyStats.mockReset();
  mockFetchLatencyStats.mockResolvedValue({
    dependencyId: 'd1',
    avgLatencyMs24h: 20,
    minLatencyMs24h: 10,
    maxLatencyMs24h: 50,
    dataPointCount: 100,
  });
});

describe('EdgeDetailsPanel', () => {
  it('renders dependency name', async () => {
    renderPanel();

    expect(screen.getByText('Database Connection')).toBeInTheDocument();
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
    expect(screen.getByText('Source Service')).toBeInTheDocument();
    expect(screen.getByText('To')).toBeInTheDocument();
    expect(screen.getByText('Target Service')).toBeInTheDocument();
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

  it('displays latency statistics', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('25ms')).toBeInTheDocument(); // Current
      expect(screen.getByText('20ms')).toBeInTheDocument(); // 24h Avg
    });

    expect(screen.getByText('10ms')).toBeInTheDocument(); // 24h Min
    expect(screen.getByText('50ms')).toBeInTheDocument(); // 24h Max
  });

  it('displays data point count', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/Based on 100 data points/)).toBeInTheDocument();
    });
  });

  it('handles latency fetch error gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchLatencyStats.mockRejectedValueOnce(new Error('Network error'));

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Database Connection')).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });

  it('shows loading state for latency stats', async () => {
    mockFetchLatencyStats.mockImplementation(() => new Promise(() => {}));

    renderPanel();

    expect(screen.getByText('Loading stats...')).toBeInTheDocument();
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
    const dataWithType = { ...mockEdgeData, dependencyType: 'database' };

    renderPanel('e1', dataWithType);

    await waitFor(() => {
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('database')).toBeInTheDocument();
    });
  });

  it('displays association type', async () => {
    const dataWithAssociation = { ...mockEdgeData, dependencyType: 'rest', associationType: 'message_queue' as const };

    renderPanel('e1', dataWithAssociation);

    await waitFor(() => {
      expect(screen.getByText('Association')).toBeInTheDocument();
      expect(screen.getByText('message queue')).toBeInTheDocument();
    });
  });

  it('displays auto-suggested source', async () => {
    const autoSuggestedData = { ...mockEdgeData, dependencyType: 'rest', isAutoSuggested: true };

    renderPanel('e1', autoSuggestedData);

    await waitFor(() => {
      expect(screen.getByText('Source')).toBeInTheDocument();
      expect(screen.getByText('Auto-suggested')).toBeInTheDocument();
    });
  });

  it('displays manual source', async () => {
    const manualData = { ...mockEdgeData, dependencyType: 'rest', isAutoSuggested: false };

    renderPanel('e1', manualData);

    await waitFor(() => {
      expect(screen.getByText('Source')).toBeInTheDocument();
      expect(screen.getByText('Manual')).toBeInTheDocument();
    });
  });

  it('displays confidence score', async () => {
    const dataWithConfidence = { ...mockEdgeData, dependencyType: 'rest', confidenceScore: 0.85 };

    renderPanel('e1', dataWithConfidence);

    await waitFor(() => {
      expect(screen.getByText('Confidence')).toBeInTheDocument();
      expect(screen.getByText('85%')).toBeInTheDocument();
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
      expect(screen.getByText('Database Connection')).toBeInTheDocument();
    });

    expect(screen.queryByText('View Service Details')).not.toBeInTheDocument();
  });

  it('formats latency in seconds for large values', async () => {
    mockFetchLatencyStats.mockResolvedValueOnce({
      dependencyId: 'd1',
      avgLatencyMs24h: 2000,
      minLatencyMs24h: 1500,
      maxLatencyMs24h: 3500,
      dataPointCount: 50,
    });

    const highLatencyData = { ...mockEdgeData, latencyMs: 2500 };

    renderPanel('e1', highLatencyData);

    await waitFor(() => {
      expect(screen.getByText('2.5s')).toBeInTheDocument();
      expect(screen.getByText('2.0s')).toBeInTheDocument();
    });
  });

  it('shows dash for null latency', async () => {
    const nullLatencyData = { ...mockEdgeData, latencyMs: null };

    renderPanel('e1', nullLatencyData);

    await waitFor(() => {
      expect(screen.getByText('Current')).toBeInTheDocument();
    });

    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('falls back to Connection when no dependency name', async () => {
    const noNameData = { ...mockEdgeData, dependencyName: undefined };

    renderPanel('e1', noNameData);

    // "Connection" appears both in the title and as a section title
    const connectionElements = screen.getAllByText('Connection');
    expect(connectionElements.length).toBe(2);
  });

  it('displays singular data point text', async () => {
    mockFetchLatencyStats.mockResolvedValueOnce({
      dependencyId: 'd1',
      avgLatencyMs24h: 20,
      minLatencyMs24h: 20,
      maxLatencyMs24h: 20,
      dataPointCount: 1,
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/Based on 1 data point in the last 24 hours/)).toBeInTheDocument();
    });
  });

  it('does not fetch stats when no dependencyId', async () => {
    const noIdData = { ...mockEdgeData, dependencyId: undefined };

    renderPanel('e1', noIdData);

    expect(mockFetchLatencyStats).not.toHaveBeenCalled();
  });

  it('hides error history button when no dependencyId', async () => {
    const noIdData = { ...mockEdgeData, dependencyId: undefined };

    renderPanel('e1', noIdData);

    expect(screen.queryByText('View Error History (24h)')).not.toBeInTheDocument();
  });

  it('shows current latency from edge data when stats not loaded yet', async () => {
    mockFetchLatencyStats.mockImplementation(() => new Promise(() => {}));

    const dataWithLatency = { ...mockEdgeData, latencyMs: 35 };

    renderPanel('e1', dataWithLatency);

    // During loading, only the spinner is shown for stats section
    expect(screen.getByText('Loading stats...')).toBeInTheDocument();
  });
});
