import { render, screen, fireEvent, act, within } from '@testing-library/react';
import DriftReview from './DriftReview';
import type { DriftFlagWithContext, DriftSummary } from '../../../types/manifest';
import type { UseDriftFlagsReturn, DriftView } from '../../../hooks/useDriftFlags';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
});

const makeSummary = (overrides: Partial<DriftSummary> = {}): DriftSummary => ({
  pending_count: 3,
  dismissed_count: 1,
  field_change_pending: 2,
  service_removal_pending: 1,
  ...overrides,
});

const makeFlag = (id: string, overrides: Partial<DriftFlagWithContext> = {}): DriftFlagWithContext => ({
  id,
  team_id: 't1',
  service_id: 's1',
  drift_type: 'field_change',
  field_name: 'health_endpoint',
  manifest_value: '/healthz',
  current_value: '/health',
  status: 'pending',
  first_detected_at: '2024-06-10T12:00:00Z',
  last_detected_at: '2024-06-15T08:00:00Z',
  resolved_at: null,
  resolved_by: null,
  sync_history_id: 'sh1',
  created_at: '2024-06-10T12:00:00Z',
  service_name: 'Auth Service',
  manifest_key: 'auth-svc',
  resolved_by_name: null,
  ...overrides,
});

let mockHookReturn: UseDriftFlagsReturn;

jest.mock('../../../hooks/useDriftFlags', () => ({
  useDriftFlags: () => mockHookReturn,
}));

function createMockHook(overrides: Partial<UseDriftFlagsReturn> = {}): UseDriftFlagsReturn {
  return {
    flags: [],
    filtered: [],
    summary: makeSummary(),
    isLoading: false,
    error: null,
    view: 'pending' as DriftView,
    setView: jest.fn(),
    typeFilter: '',
    setTypeFilter: jest.fn(),
    serviceFilter: '',
    setServiceFilter: jest.fn(),
    selectedIds: new Set<string>(),
    toggleSelected: jest.fn(),
    selectAll: jest.fn(),
    clearSelection: jest.fn(),
    loadFlags: jest.fn(),
    accept: jest.fn(),
    dismiss: jest.fn(),
    reopen: jest.fn(),
    bulkAccept: jest.fn().mockResolvedValue(undefined),
    bulkDismiss: jest.fn().mockResolvedValue(undefined),
    clearError: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockHookReturn = createMockHook();
});

describe('DriftReview', () => {
  it('shows loading state', () => {
    mockHookReturn = createMockHook({ isLoading: true, summary: null });
    render(<DriftReview teamId="t1" canManage={true} />);
    expect(screen.getByText('Loading drift flags...')).toBeInTheDocument();
  });

  it('shows error state with dismiss button', () => {
    mockHookReturn = createMockHook({ error: 'Failed to load drift flags' });
    render(<DriftReview teamId="t1" canManage={true} />);
    expect(screen.getByText('Failed to load drift flags')).toBeInTheDocument();

    fireEvent.click(screen.getByText('\u00d7'));
    expect(mockHookReturn.clearError).toHaveBeenCalled();
  });

  it('shows pending/dismissed toggle with counts', () => {
    mockHookReturn = createMockHook();
    render(<DriftReview teamId="t1" canManage={true} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByText('Dismissed')).toBeInTheDocument();
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('calls setView when switching tabs', () => {
    mockHookReturn = createMockHook();
    render(<DriftReview teamId="t1" canManage={true} />);
    fireEvent.click(screen.getByText('Dismissed'));
    expect(mockHookReturn.setView).toHaveBeenCalledWith('dismissed');
  });

  it('shows drift flag cards', () => {
    const flags = [
      makeFlag('df1', { service_name: 'Auth Service' }),
      makeFlag('df2', { service_name: 'Billing Service', service_id: 's2' }),
    ];
    mockHookReturn = createMockHook({ filtered: flags });
    render(<DriftReview teamId="t1" canManage={true} />);
    // Service names appear in both cards and filter dropdown
    expect(screen.getAllByText('Auth Service').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Billing Service').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no pending flags', () => {
    mockHookReturn = createMockHook({ filtered: [], summary: makeSummary({ pending_count: 0 }) });
    render(<DriftReview teamId="t1" canManage={true} />);
    expect(screen.getByText(/No pending drift flags/)).toBeInTheDocument();
  });

  it('shows dismissed empty state', () => {
    mockHookReturn = createMockHook({
      filtered: [],
      view: 'dismissed',
      summary: makeSummary({ dismissed_count: 0 }),
    });
    render(<DriftReview teamId="t1" canManage={true} />);
    expect(screen.getByText(/No dismissed drift flags/)).toBeInTheDocument();
  });

  it('shows type filter dropdown when flags exist', () => {
    mockHookReturn = createMockHook({ filtered: [makeFlag('df1')] });
    render(<DriftReview teamId="t1" canManage={true} />);
    expect(screen.getByLabelText('Filter by type')).toBeInTheDocument();
  });

  it('shows service filter when multiple services present', () => {
    mockHookReturn = createMockHook({
      filtered: [
        makeFlag('df1', { service_id: 's1', service_name: 'Auth Service' }),
        makeFlag('df2', { service_id: 's2', service_name: 'Billing Service' }),
      ],
    });
    render(<DriftReview teamId="t1" canManage={true} />);
    expect(screen.getByLabelText('Filter by service')).toBeInTheDocument();
  });

  it('hides service filter with only one service', () => {
    mockHookReturn = createMockHook({
      filtered: [
        makeFlag('df1', { service_id: 's1' }),
        makeFlag('df2', { service_id: 's1' }),
      ],
    });
    render(<DriftReview teamId="t1" canManage={true} />);
    expect(screen.queryByLabelText('Filter by service')).not.toBeInTheDocument();
  });

  it('shows select all checkbox for managers', () => {
    mockHookReturn = createMockHook({ filtered: [makeFlag('df1')] });
    render(<DriftReview teamId="t1" canManage={true} />);
    expect(screen.getByText(/Select all/)).toBeInTheDocument();
  });

  it('hides select all for non-managers', () => {
    mockHookReturn = createMockHook({ filtered: [makeFlag('df1')] });
    render(<DriftReview teamId="t1" canManage={false} />);
    expect(screen.queryByText(/Select all/)).not.toBeInTheDocument();
  });

  it('toggles select all', () => {
    const flags = [makeFlag('df1'), makeFlag('df2')];
    mockHookReturn = createMockHook({ filtered: flags });
    render(<DriftReview teamId="t1" canManage={true} />);

    fireEvent.click(screen.getByText(/Select all/));
    expect(mockHookReturn.selectAll).toHaveBeenCalled();
  });

  it('shows bulk actions when items selected', () => {
    mockHookReturn = createMockHook({
      filtered: [makeFlag('df1')],
      selectedIds: new Set(['df1']),
    });
    render(<DriftReview teamId="t1" canManage={true} />);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByText('Accept All')).toBeInTheDocument();
    expect(screen.getByText('Dismiss All')).toBeInTheDocument();
  });

  it('shows only Accept All in dismissed view', () => {
    mockHookReturn = createMockHook({
      filtered: [makeFlag('df1', { status: 'dismissed' })],
      selectedIds: new Set(['df1']),
      view: 'dismissed',
    });
    render(<DriftReview teamId="t1" canManage={true} />);
    expect(screen.getByText('Accept All')).toBeInTheDocument();
    expect(screen.queryByText('Dismiss All')).not.toBeInTheDocument();
  });

  it('shows bulk accept confirmation dialog', () => {
    mockHookReturn = createMockHook({
      filtered: [makeFlag('df1')],
      selectedIds: new Set(['df1']),
    });
    render(<DriftReview teamId="t1" canManage={true} />);

    fireEvent.click(screen.getByText('Accept All'));
    expect(screen.getByText('Accept Selected Flags')).toBeInTheDocument();
    expect(screen.getByText(/Accept 1 selected drift flag\?/)).toBeInTheDocument();
  });

  it('shows bulk dismiss confirmation dialog', () => {
    mockHookReturn = createMockHook({
      filtered: [makeFlag('df1')],
      selectedIds: new Set(['df1']),
    });
    render(<DriftReview teamId="t1" canManage={true} />);

    fireEvent.click(screen.getByText('Dismiss All'));
    expect(screen.getByText('Dismiss Selected Flags')).toBeInTheDocument();
    expect(screen.getByText(/Dismiss 1 selected drift flag\?/)).toBeInTheDocument();
  });

  it('calls bulkAccept on confirm', async () => {
    mockHookReturn = createMockHook({
      filtered: [makeFlag('df1')],
      selectedIds: new Set(['df1']),
    });
    render(<DriftReview teamId="t1" canManage={true} />);

    fireEvent.click(screen.getByText('Accept All'));
    expect(screen.getByText('Accept Selected Flags')).toBeInTheDocument();

    // Click the confirm button inside the dialog (find by modal title heading)
    const modalTitle = screen.getByText('Accept Selected Flags');
    const dialog = modalTitle.closest('dialog')!;
    await act(async () => {
      fireEvent.click(within(dialog).getByText('Accept'));
    });

    expect(mockHookReturn.bulkAccept).toHaveBeenCalled();
    expect(screen.queryByText('Accept Selected Flags')).not.toBeInTheDocument();
  });

  it('calls bulkDismiss on confirm', async () => {
    mockHookReturn = createMockHook({
      filtered: [makeFlag('df1')],
      selectedIds: new Set(['df1']),
    });
    render(<DriftReview teamId="t1" canManage={true} />);

    fireEvent.click(screen.getByText('Dismiss All'));

    // Click the confirm button inside the dialog
    const modalTitle = screen.getByText('Dismiss Selected Flags');
    const dialog = modalTitle.closest('dialog')!;
    await act(async () => {
      fireEvent.click(within(dialog).getByText('Dismiss'));
    });

    expect(mockHookReturn.bulkDismiss).toHaveBeenCalled();
  });

  it('cancels bulk action dialog', () => {
    mockHookReturn = createMockHook({
      filtered: [makeFlag('df1')],
      selectedIds: new Set(['df1']),
    });
    render(<DriftReview teamId="t1" canManage={true} />);

    fireEvent.click(screen.getByText('Accept All'));
    expect(screen.getByText('Accept Selected Flags')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Accept Selected Flags')).not.toBeInTheDocument();
  });

  it('calls loadFlags on mount', () => {
    mockHookReturn = createMockHook();
    render(<DriftReview teamId="t1" canManage={true} />);
    expect(mockHookReturn.loadFlags).toHaveBeenCalled();
  });

  it('hides bulk actions for non-managers', () => {
    mockHookReturn = createMockHook({
      filtered: [makeFlag('df1')],
      selectedIds: new Set(['df1']),
    });
    render(<DriftReview teamId="t1" canManage={false} />);
    expect(screen.queryByText('Accept All')).not.toBeInTheDocument();
    expect(screen.queryByText('Dismiss All')).not.toBeInTheDocument();
  });
});
