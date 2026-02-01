import { render, screen, fireEvent } from '@testing-library/react';
import AliasesManager from '../AliasesManager';

const mockLoadAliases = jest.fn();
const mockLoadCanonicalNames = jest.fn();
const mockAddAlias = jest.fn();
const mockRemoveAlias = jest.fn();

jest.mock('../../../../hooks/useAliases', () => ({
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
});
