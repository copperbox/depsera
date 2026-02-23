import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('../../../api/services');
jest.mock('../../../api/associations');
jest.mock('./AssociationForm', () => ({
  __esModule: true,
  default: ({ dependencyId, onSuccess, onCancel }: { dependencyId?: string; onSuccess?: () => void; onCancel?: () => void }) => (
    <div data-testid="association-form" data-dep-id={dependencyId}>
      <button onClick={onSuccess}>mock-submit</button>
      <button onClick={onCancel}>mock-cancel</button>
    </div>
  ),
}));
jest.mock('../../common/ConfirmDialog', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, onConfirm, title, message }: { isOpen: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string }) =>
    isOpen ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <span>{message}</span>
        <button onClick={onConfirm}>confirm-delete</button>
        <button onClick={onClose}>cancel-delete</button>
      </div>
    ) : null,
}));

// Mock auth context
const mockUseAuth = jest.fn();
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock useAliases
const mockLoadAliases = jest.fn();
const mockLoadCanonicalNames = jest.fn();
const mockAddAlias = jest.fn();
const mockRemoveAlias = jest.fn();
let mockAliases: { id: string; alias: string; canonical_name: string; created_at: string }[] = [];
let mockCanonicalNames: string[] = [];

jest.mock('../../../hooks/useAliases', () => ({
  useAliases: () => ({
    aliases: mockAliases,
    canonicalNames: mockCanonicalNames,
    isLoading: false,
    error: null,
    loadAliases: mockLoadAliases,
    loadCanonicalNames: mockLoadCanonicalNames,
    addAlias: mockAddAlias,
    editAlias: jest.fn(),
    removeAlias: mockRemoveAlias,
  }),
}));

import { fetchServices } from '../../../api/services';
import { fetchAssociations, deleteAssociation } from '../../../api/associations';
import ManageAssociations from './ManageAssociations';

const mockFetchServices = fetchServices as jest.MockedFunction<typeof fetchServices>;
const mockFetchAssociations = fetchAssociations as jest.MockedFunction<typeof fetchAssociations>;
const mockDeleteAssociation = deleteAssociation as jest.MockedFunction<typeof deleteAssociation>;

function makeService(overrides = {}) {
  return {
    id: 'svc-1',
    name: 'Service Alpha',
    team_id: 'team-1',
    health_endpoint: 'http://localhost:3000/health',
    metrics_endpoint: null,
    schema_config: null,
    is_active: 1,
    last_poll_success: 1,
    last_poll_error: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    team: { id: 'team-1', name: 'Team One', description: null, created_at: '', updated_at: '' },
    health: {
      status: 'healthy' as const,
      healthy_reports: 1,
      warning_reports: 0,
      critical_reports: 0,
      total_reports: 1,
      dependent_count: 0,
      last_report: null,
    },
    dependencies: [
      {
        id: 'dep-1',
        service_id: 'svc-1',
        name: 'Redis',
        canonical_name: null,
        description: null,
        impact: null,
        healthy: 1,
        health_state: 0 as const,
        health_code: null,
        latency_ms: 5,
        last_checked: '2024-01-01T00:00:00Z',
        last_status_change: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
    dependent_reports: [],
    ...overrides,
  };
}

function makeAssociation(overrides = {}) {
  return {
    id: 'assoc-1',
    dependency_id: 'dep-1',
    linked_service_id: 'svc-2',
    association_type: 'api_call' as const,
    is_auto_suggested: 0,
    confidence_score: null,
    is_dismissed: 0,
    created_at: '2024-01-01T00:00:00Z',
    linked_service: {
      id: 'svc-2',
      name: 'Service Beta',
      team_id: 'team-1',
      health_endpoint: 'http://localhost:3001/health',
      metrics_endpoint: null,
      schema_config: null,
      is_active: 1,
      last_poll_success: 1,
      last_poll_error: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      team: { id: 'team-1', name: 'Team One', description: null, created_at: '', updated_at: '' },
      health: {
        status: 'healthy' as const,
        healthy_reports: 0,
        warning_reports: 0,
        critical_reports: 0,
        total_reports: 0,
        dependent_count: 0,
        last_report: null,
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockFetchServices.mockReset();
  mockFetchAssociations.mockReset();
  mockDeleteAssociation.mockReset();
  mockLoadAliases.mockReset();
  mockLoadCanonicalNames.mockReset();
  mockAddAlias.mockReset();
  mockRemoveAlias.mockReset();
  mockAliases = [];
  mockCanonicalNames = [];
  mockUseAuth.mockReturnValue({ isAdmin: true });
});

describe('ManageAssociations', () => {
  it('shows loading state', () => {
    mockFetchServices.mockReturnValue(new Promise(() => {}));
    render(<ManageAssociations />);
    expect(screen.getByText('Loading services and dependencies...')).toBeInTheDocument();
  });

  it('shows error state', async () => {
    mockFetchServices.mockRejectedValue(new Error('Network error'));
    render(<ManageAssociations />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows empty state when no services have dependencies', async () => {
    mockFetchServices.mockResolvedValue([]);
    render(<ManageAssociations />);

    await waitFor(() => {
      expect(screen.getByText('No services with dependencies found.')).toBeInTheDocument();
    });
  });

  it('renders search bar and filter', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);
    render(<ManageAssociations />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search services and dependencies...')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
  });

  it('renders service groups with dependency counts', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);
    render(<ManageAssociations />);

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });
    expect(screen.getByText('1 dependency')).toBeInTheDocument();
  });

  it('shows plural "dependencies" for multiple deps', async () => {
    mockFetchServices.mockResolvedValue([
      makeService({
        dependencies: [
          { id: 'dep-1', service_id: 'svc-1', name: 'Redis', canonical_name: null, description: null, impact: null, healthy: 1, health_state: 0, health_code: null, latency_ms: 5, last_checked: '', last_status_change: null, created_at: '', updated_at: '' },
          { id: 'dep-2', service_id: 'svc-1', name: 'PostgreSQL', canonical_name: null, description: null, impact: null, healthy: 1, health_state: 0, health_code: null, latency_ms: 10, last_checked: '', last_status_change: null, created_at: '', updated_at: '' },
        ],
      }),
    ]);
    render(<ManageAssociations />);

    await waitFor(() => {
      expect(screen.getByText('2 dependencies')).toBeInTheDocument();
    });
  });

  it('expands service to show dependencies', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);
    render(<ManageAssociations />);

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    // Dependency name should not be visible before expansion
    expect(screen.queryByText('Redis')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Service Alpha'));

    expect(screen.getByText('Redis')).toBeInTheDocument();
  });

  it('expands dependency to show associations panel', async () => {
    const assocs = [makeAssociation()];
    mockFetchServices.mockResolvedValue([makeService()]);
    mockFetchAssociations.mockResolvedValue(assocs);
    render(<ManageAssociations />);

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    // Expand service
    fireEvent.click(screen.getByText('Service Alpha'));
    // Expand dependency
    fireEvent.click(screen.getByText('Redis'));

    await waitFor(() => {
      expect(screen.getByText('Service Beta')).toBeInTheDocument();
    });
    expect(screen.getByText('API Call')).toBeInTheDocument();
    expect(screen.getByText('+ Add Association')).toBeInTheDocument();
  });

  it('shows no associations message when dep has none', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);
    mockFetchAssociations.mockResolvedValue([]);
    render(<ManageAssociations />);

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Service Alpha'));
    fireEvent.click(screen.getByText('Redis'));

    await waitFor(() => {
      expect(screen.getByText('No associations yet.')).toBeInTheDocument();
    });
  });

  it('shows add association form when button clicked', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);
    mockFetchAssociations.mockResolvedValue([]);
    render(<ManageAssociations />);

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Service Alpha'));
    fireEvent.click(screen.getByText('Redis'));

    await waitFor(() => {
      expect(screen.getByText('+ Add Association')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Association'));

    expect(screen.getByTestId('association-form')).toBeInTheDocument();
    expect(screen.getByTestId('association-form')).toHaveAttribute('data-dep-id', 'dep-1');
  });

  it('hides form on cancel', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);
    mockFetchAssociations.mockResolvedValue([]);
    render(<ManageAssociations />);

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Service Alpha'));
    fireEvent.click(screen.getByText('Redis'));

    await waitFor(() => {
      expect(screen.getByText('+ Add Association')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('+ Add Association'));
    expect(screen.getByTestId('association-form')).toBeInTheDocument();

    fireEvent.click(screen.getByText('mock-cancel'));
    expect(screen.queryByTestId('association-form')).not.toBeInTheDocument();
  });

  it('opens confirm dialog when delete button is clicked', async () => {
    const assocs = [makeAssociation()];
    mockFetchServices.mockResolvedValue([makeService()]);
    mockFetchAssociations.mockResolvedValue(assocs);
    render(<ManageAssociations />);

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Service Alpha'));
    fireEvent.click(screen.getByText('Redis'));

    await waitFor(() => {
      expect(screen.getByText('Service Beta')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Delete association'));

    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete Association')).toBeInTheDocument();
  });

  it('deletes association on confirm', async () => {
    const assocs = [makeAssociation()];
    mockFetchServices.mockResolvedValue([makeService()]);
    mockFetchAssociations.mockResolvedValue(assocs);
    mockDeleteAssociation.mockResolvedValue(undefined);
    render(<ManageAssociations />);

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Service Alpha'));
    fireEvent.click(screen.getByText('Redis'));

    await waitFor(() => {
      expect(screen.getByText('Service Beta')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Delete association'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('confirm-delete'));

    await waitFor(() => {
      expect(mockDeleteAssociation).toHaveBeenCalledWith('dep-1', 'svc-2');
    });
  });

  it('closes confirm dialog on cancel', async () => {
    const assocs = [makeAssociation()];
    mockFetchServices.mockResolvedValue([makeService()]);
    mockFetchAssociations.mockResolvedValue(assocs);
    render(<ManageAssociations />);

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Service Alpha'));
    fireEvent.click(screen.getByText('Redis'));

    await waitFor(() => {
      expect(screen.getByText('Service Beta')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Delete association'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('cancel-delete'));
    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
  });

  it('filters services by search text', async () => {
    mockFetchServices.mockResolvedValue([
      makeService(),
      makeService({
        id: 'svc-2',
        name: 'Service Beta',
        dependencies: [
          { id: 'dep-2', service_id: 'svc-2', name: 'Kafka', canonical_name: null, description: null, impact: null, healthy: 1, health_state: 0, health_code: null, latency_ms: 2, last_checked: '', last_status_change: null, created_at: '', updated_at: '' },
        ],
      }),
    ]);
    render(<ManageAssociations />);

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
      expect(screen.getByText('Service Beta')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search services and dependencies...'), {
      target: { value: 'Beta' },
    });

    expect(screen.queryByText('Service Alpha')).not.toBeInTheDocument();
    expect(screen.getByText('Service Beta')).toBeInTheDocument();
  });

  it('shows filter-specific empty message', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);
    render(<ManageAssociations />);

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search services and dependencies...'), {
      target: { value: 'NonExistent' },
    });

    expect(screen.getByText('No services match your filters.')).toBeInTheDocument();
  });

  describe('inline aliases', () => {
    async function expandDependency() {
      mockFetchServices.mockResolvedValue([makeService()]);
      mockFetchAssociations.mockResolvedValue([]);
      render(<ManageAssociations />);

      await waitFor(() => {
        expect(screen.getByText('Service Alpha')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Service Alpha'));
      fireEvent.click(screen.getByText('Redis'));

      await waitFor(() => {
        expect(screen.getByText('Aliases')).toBeInTheDocument();
      });
    }

    it('shows Aliases section header in expanded dependency panel', async () => {
      await expandDependency();
      expect(screen.getByText('Aliases')).toBeInTheDocument();
    });

    it('displays existing aliases for the dependency', async () => {
      mockAliases = [
        { id: 'alias-1', alias: 'Redis', canonical_name: 'Primary Cache', created_at: '2024-01-01T00:00:00Z' },
        { id: 'alias-2', alias: 'other-dep', canonical_name: 'Other', created_at: '2024-01-01T00:00:00Z' },
      ];
      await expandDependency();

      // Should show alias matching dep name 'Redis'
      expect(screen.getByText(/Primary Cache/)).toBeInTheDocument();
      // Should not show alias for other dependency
      expect(screen.queryByText(/Other/)).not.toBeInTheDocument();
    });

    it('admin sees "+ Add Alias" button', async () => {
      await expandDependency();
      expect(screen.getByText('+ Add Alias')).toBeInTheDocument();
    });

    it('non-admin does not see "+ Add Alias" button', async () => {
      mockUseAuth.mockReturnValue({ isAdmin: false });
      await expandDependency();
      expect(screen.queryByText('+ Add Alias')).not.toBeInTheDocument();
    });

    it('clicking "+ Add Alias" shows canonical name input', async () => {
      await expandDependency();
      fireEvent.click(screen.getByText('+ Add Alias'));

      expect(screen.getByPlaceholderText('Canonical name')).toBeInTheDocument();
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('submitting alias form calls addAlias with dep name and canonical name', async () => {
      mockAddAlias.mockResolvedValue(undefined);
      await expandDependency();

      fireEvent.click(screen.getByText('+ Add Alias'));
      fireEvent.change(screen.getByPlaceholderText('Canonical name'), {
        target: { value: 'Primary Cache' },
      });
      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockAddAlias).toHaveBeenCalledWith({
          alias: 'Redis',
          canonical_name: 'Primary Cache',
        });
      });
    });

    it('cancel hides the alias form', async () => {
      await expandDependency();
      fireEvent.click(screen.getByText('+ Add Alias'));
      expect(screen.getByPlaceholderText('Canonical name')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Cancel'));
      expect(screen.queryByPlaceholderText('Canonical name')).not.toBeInTheDocument();
    });

    it('admin can delete an alias', async () => {
      mockAliases = [
        { id: 'alias-1', alias: 'Redis', canonical_name: 'Primary Cache', created_at: '2024-01-01T00:00:00Z' },
      ];
      mockRemoveAlias.mockResolvedValue(undefined);
      await expandDependency();

      const deleteButtons = screen.getAllByTitle('Delete alias');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(mockRemoveAlias).toHaveBeenCalledWith('alias-1');
      });
    });

    it('non-admin does not see delete button for aliases', async () => {
      mockUseAuth.mockReturnValue({ isAdmin: false });
      mockAliases = [
        { id: 'alias-1', alias: 'Redis', canonical_name: 'Primary Cache', created_at: '2024-01-01T00:00:00Z' },
      ];
      await expandDependency();

      expect(screen.getByText(/Primary Cache/)).toBeInTheDocument();
      expect(screen.queryByTitle('Delete alias')).not.toBeInTheDocument();
    });

    it('loads aliases and canonical names on mount', () => {
      mockFetchServices.mockResolvedValue([]);
      render(<ManageAssociations />);

      expect(mockLoadAliases).toHaveBeenCalled();
      expect(mockLoadCanonicalNames).toHaveBeenCalled();
    });
  });
});
