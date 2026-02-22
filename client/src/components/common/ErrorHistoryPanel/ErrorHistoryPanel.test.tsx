import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ErrorHistoryPanel } from './ErrorHistoryPanel';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockErrorHistory = {
  dependencyId: 'dep-1',
  errorCount: 3,
  errors: [
    {
      error: { code: 500, message: 'Internal Server Error' },
      errorMessage: 'Connection refused',
      recordedAt: '2024-01-15T10:00:00Z',
      isRecovery: false,
    },
    {
      error: null,
      errorMessage: null,
      recordedAt: '2024-01-15T10:05:00Z',
      isRecovery: true,
    },
    {
      error: null,
      errorMessage: null,
      recordedAt: '2024-01-15T10:10:00Z',
      isRecovery: false,
    },
  ],
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('ErrorHistoryPanel', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(
      <ErrorHistoryPanel
        dependencyId="dep-1"
        dependencyName="Test Dependency"
        onBack={() => {}}
      />
    );

    expect(screen.getByText('Loading error history...')).toBeInTheDocument();
  });

  it('renders header with back button and dependency name', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockErrorHistory));

    const onBack = jest.fn();
    render(
      <ErrorHistoryPanel
        dependencyId="dep-1"
        dependencyName="Test Dependency"
        onBack={onBack}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading error history...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Error History')).toBeInTheDocument();
    expect(screen.getByText('Test Dependency')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Go back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('displays error count and timeline', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockErrorHistory));

    render(
      <ErrorHistoryPanel
        dependencyId="dep-1"
        dependencyName="Test Dependency"
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Events (24h)')).toBeInTheDocument();
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
    expect(screen.getByText('Recovered')).toBeInTheDocument();
    expect(screen.getByText('Unknown error')).toBeInTheDocument(); // Error without message
  });

  it('expands and collapses error details', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockErrorHistory));

    render(
      <ErrorHistoryPanel
        dependencyId="dep-1"
        dependencyName="Test Dependency"
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Connection refused')).toBeInTheDocument();
    });

    // Click to expand details
    fireEvent.click(screen.getByText('Show details'));
    expect(screen.getByText(/"code": 500/)).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(screen.getByText('Hide details'));
    expect(screen.queryByText(/"code": 500/)).not.toBeInTheDocument();
  });

  it('displays empty state when no errors', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      dependencyId: 'dep-1',
      errorCount: 0,
      errors: [],
    }));

    render(
      <ErrorHistoryPanel
        dependencyId="dep-1"
        dependencyName="Test Dependency"
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No errors in the last 24 hours')).toBeInTheDocument();
    });
  });

  it('displays error state and allows retry', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(jsonResponse(mockErrorHistory));

    render(
      <ErrorHistoryPanel
        dependencyId="dep-1"
        dependencyName="Test Dependency"
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Connection refused')).toBeInTheDocument();
    });
  });

  it('handles non-Error exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    render(
      <ErrorHistoryPanel
        dependencyId="dep-1"
        dependencyName="Test Dependency"
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load error history')).toBeInTheDocument();
    });
  });

  it('handles retry failure with non-Error exception', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('First error'))
      .mockRejectedValueOnce('String error');

    render(
      <ErrorHistoryPanel
        dependencyId="dep-1"
        dependencyName="Test Dependency"
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('First error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Failed to load')).toBeInTheDocument();
    });
  });

  it('reloads when dependency ID changes', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockErrorHistory))
      .mockResolvedValueOnce(jsonResponse({
        ...mockErrorHistory,
        dependencyId: 'dep-2',
        errorCount: 1,
      }));

    const { rerender } = render(
      <ErrorHistoryPanel
        dependencyId="dep-1"
        dependencyName="Test Dependency"
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    rerender(
      <ErrorHistoryPanel
        dependencyId="dep-2"
        dependencyName="Other Dependency"
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  it('handles string error in details', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      dependencyId: 'dep-1',
      errorCount: 1,
      errors: [
        {
          error: 'Simple string error',
          errorMessage: 'Error occurred',
          recordedAt: '2024-01-15T10:00:00Z',
          isRecovery: false,
        },
      ],
    }));

    render(
      <ErrorHistoryPanel
        dependencyId="dep-1"
        dependencyName="Test Dependency"
        onBack={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Error occurred')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Show details'));
    expect(screen.getByText('Simple string error')).toBeInTheDocument();
  });
});
