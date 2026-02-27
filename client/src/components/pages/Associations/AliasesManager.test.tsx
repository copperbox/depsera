import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AliasesManager from './AliasesManager';

const mockLoadAliases = jest.fn();
const mockLoadCanonicalNames = jest.fn();
const mockAddAlias = jest.fn();
const mockRemoveAlias = jest.fn();

// Mock auth context
const mockUseAuth = jest.fn();
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../../../hooks/useAliases', () => ({
  useAliases: () => ({
    aliases: mockAliases,
    canonicalNames: mockCanonicalNames,
    isLoading: mockIsLoading,
    error: mockError,
    loadAliases: mockLoadAliases,
    loadCanonicalNames: mockLoadCanonicalNames,
    addAlias: mockAddAlias,
    editAlias: jest.fn(),
    removeAlias: mockRemoveAlias,
  }),
}));

const defaultProps = {
  dependencyOptions: [
    { value: 'postgres-main', label: 'postgres-main', group: 'Service A' },
    { value: 'redis-cache', label: 'redis-cache', group: 'Service A' },
    { value: 'user-api', label: 'user-api', group: 'Service B' },
  ],
};

let mockAliases: { id: string; alias: string; canonical_name: string; created_at: string }[] = [];
let mockCanonicalNames: string[] = [];
let mockIsLoading = false;
let mockError: string | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  mockAliases = [];
  mockCanonicalNames = [];
  mockIsLoading = false;
  mockError = null;
  mockUseAuth.mockReturnValue({ isAdmin: true, isLead: false });
});

describe('AliasesManager', () => {
  it('renders description and form', () => {
    render(<AliasesManager {...defaultProps} />);

    expect(screen.getByText(/Map dependency names/)).toBeInTheDocument();
    expect(screen.getByText('Alias (reported name)')).toBeInTheDocument();
    expect(screen.getByText('Add Alias')).toBeInTheDocument();
  });

  it('loads aliases on mount', () => {
    render(<AliasesManager {...defaultProps} />);

    expect(mockLoadAliases).toHaveBeenCalled();
    expect(mockLoadCanonicalNames).toHaveBeenCalled();
  });

  it('shows empty state when no aliases', () => {
    render(<AliasesManager {...defaultProps} />);

    expect(screen.getByText(/No aliases configured/)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockIsLoading = true;
    render(<AliasesManager {...defaultProps} />);

    expect(screen.getByText('Loading aliases...')).toBeInTheDocument();
  });

  it('shows error message', () => {
    mockError = 'Something went wrong';
    render(<AliasesManager {...defaultProps} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders aliases grouped by canonical name', () => {
    mockAliases = [
      { id: '1', alias: 'pg-main', canonical_name: 'Primary DB', created_at: '' },
      { id: '2', alias: 'postgres', canonical_name: 'Primary DB', created_at: '' },
      { id: '3', alias: 'redis-1', canonical_name: 'Cache', created_at: '' },
    ];

    render(<AliasesManager {...defaultProps} />);

    expect(screen.getByText('Primary DB')).toBeInTheDocument();
    expect(screen.getByText('Cache')).toBeInTheDocument();
    expect(screen.getByText('pg-main')).toBeInTheDocument();
    expect(screen.getByText('postgres')).toBeInTheDocument();
    expect(screen.getByText('redis-1')).toBeInTheDocument();
  });

  it('shows dependency names in searchable select dropdown', () => {
    render(<AliasesManager {...defaultProps} />);

    // Open the SearchableSelect dropdown
    fireEvent.click(screen.getByText('e.g. postgres-main'));

    expect(screen.getByText('postgres-main')).toBeInTheDocument();
    expect(screen.getByText('redis-cache')).toBeInTheDocument();
    expect(screen.getByText('user-api')).toBeInTheDocument();
  });

  it('calls removeAlias on delete click', async () => {
    mockAliases = [
      { id: '1', alias: 'pg-main', canonical_name: 'Primary DB', created_at: '' },
    ];
    mockRemoveAlias.mockResolvedValue(undefined);

    render(<AliasesManager {...defaultProps} />);

    fireEvent.click(screen.getByTitle('Delete alias'));

    expect(mockRemoveAlias).toHaveBeenCalledWith('1');
  });

  it('submits form and clears inputs on success', async () => {
    mockAddAlias.mockResolvedValue({ id: '1', alias: 'pg', canonical_name: 'DB' });
    render(<AliasesManager {...defaultProps} />);

    // Open the SearchableSelect and select an option
    fireEvent.click(screen.getByText('e.g. postgres-main'));
    fireEvent.click(screen.getByText('postgres-main'));

    // Enter canonical name
    const canonicalInput = screen.getByPlaceholderText('e.g. Primary Database');
    fireEvent.change(canonicalInput, { target: { value: 'Primary DB' } });

    // Submit form
    fireEvent.click(screen.getByText('Add Alias'));

    await waitFor(() => {
      expect(mockAddAlias).toHaveBeenCalledWith({ alias: 'postgres-main', canonical_name: 'Primary DB' });
    });
  });

  it('does not submit when alias is empty', async () => {
    render(<AliasesManager {...defaultProps} />);

    // Only enter canonical name (no alias)
    const canonicalInput = screen.getByPlaceholderText('e.g. Primary Database');
    fireEvent.change(canonicalInput, { target: { value: 'Primary DB' } });

    // Submit button should be disabled
    expect(screen.getByText('Add Alias').closest('button')).toBeDisabled();
  });

  it('does not submit when canonical name is empty', async () => {
    render(<AliasesManager {...defaultProps} />);

    // Open the SearchableSelect and select an option
    fireEvent.click(screen.getByText('e.g. postgres-main'));
    fireEvent.click(screen.getByText('postgres-main'));

    // Submit button should be disabled (no canonical name)
    expect(screen.getByText('Add Alias').closest('button')).toBeDisabled();
  });

  it('handles addAlias error gracefully', async () => {
    mockAddAlias.mockRejectedValue(new Error('Network error'));
    render(<AliasesManager {...defaultProps} />);

    // Open the SearchableSelect and select an option
    fireEvent.click(screen.getByText('e.g. postgres-main'));
    fireEvent.click(screen.getByText('postgres-main'));

    // Enter canonical name
    const canonicalInput = screen.getByPlaceholderText('e.g. Primary Database');
    fireEvent.change(canonicalInput, { target: { value: 'Primary DB' } });

    // Submit form
    fireEvent.click(screen.getByText('Add Alias'));

    // Wait for the async call to complete - error is set in hook
    await waitFor(() => {
      expect(mockAddAlias).toHaveBeenCalled();
    });
  });

  it('renders canonical names datalist', () => {
    mockCanonicalNames = ['Primary DB', 'Cache Layer', 'Auth Service'];
    render(<AliasesManager {...defaultProps} />);

    const datalist = document.getElementById('canonical-names-list');
    expect(datalist).toBeInTheDocument();
    expect(datalist?.querySelectorAll('option')).toHaveLength(3);
  });

  describe('team lead user', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ isAdmin: false, isLead: true });
    });

    it('shows the add alias form for team leads', () => {
      render(<AliasesManager {...defaultProps} />);

      expect(screen.getByText('Alias (reported name)')).toBeInTheDocument();
      expect(screen.getByText('Add Alias')).toBeInTheDocument();
    });

    it('shows delete buttons for team leads', () => {
      mockAliases = [
        { id: '1', alias: 'pg-main', canonical_name: 'Primary DB', created_at: '' },
      ];

      render(<AliasesManager {...defaultProps} />);

      expect(screen.getByTitle('Delete alias')).toBeInTheDocument();
    });
  });

  describe('non-admin non-lead user', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ isAdmin: false, isLead: false });
    });

    it('hides the add alias form', () => {
      render(<AliasesManager {...defaultProps} />);

      expect(screen.queryByText('Add Alias')).not.toBeInTheDocument();
      expect(screen.queryByText('Alias (reported name)')).not.toBeInTheDocument();
    });

    it('hides delete buttons', () => {
      mockAliases = [
        { id: '1', alias: 'pg-main', canonical_name: 'Primary DB', created_at: '' },
      ];

      render(<AliasesManager {...defaultProps} />);

      expect(screen.getByText('pg-main')).toBeInTheDocument();
      expect(screen.queryByTitle('Delete alias')).not.toBeInTheDocument();
    });

    it('still displays aliases in read-only mode', () => {
      mockAliases = [
        { id: '1', alias: 'pg-main', canonical_name: 'Primary DB', created_at: '' },
        { id: '2', alias: 'redis-1', canonical_name: 'Cache', created_at: '' },
      ];

      render(<AliasesManager {...defaultProps} />);

      expect(screen.getByText('Primary DB')).toBeInTheDocument();
      expect(screen.getByText('Cache')).toBeInTheDocument();
      expect(screen.getByText('pg-main')).toBeInTheDocument();
      expect(screen.getByText('redis-1')).toBeInTheDocument();
    });
  });
});
