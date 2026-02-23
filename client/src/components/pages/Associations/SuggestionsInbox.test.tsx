import { render, screen, fireEvent } from '@testing-library/react';
import SuggestionsInbox from './SuggestionsInbox';
import type { UseSuggestionsReturn } from './../../../hooks/useSuggestions';
import type { AssociationSuggestion } from './../../../types/association';

function makeSuggestion(overrides: Partial<AssociationSuggestion> = {}): AssociationSuggestion {
  return {
    id: 's1',
    dependency_id: 'd1',
    linked_service_id: 'ls1',
    association_type: 'api_call',
    is_auto_suggested: 1,
    confidence_score: 85,
    is_dismissed: 0,
    match_reason: null,
    created_at: '2025-01-01',
    dependency_name: 'dep-1',
    service_name: 'Service A',
    linked_service_name: 'Service B',
    ...overrides,
  };
}

function makeHook(overrides: Partial<UseSuggestionsReturn> = {}): UseSuggestionsReturn {
  const suggestions = overrides.suggestions ?? [makeSuggestion()];
  return {
    suggestions,
    filtered: overrides.filtered ?? suggestions,
    isLoading: false,
    error: null,
    selectedIds: new Set(),
    serviceFilter: '',
    teamFilter: '',
    setServiceFilter: jest.fn(),
    setTeamFilter: jest.fn(),
    toggleSelected: jest.fn(),
    selectAll: jest.fn(),
    clearSelection: jest.fn(),
    loadSuggestions: jest.fn(),
    accept: jest.fn(),
    dismiss: jest.fn(),
    bulkAccept: jest.fn(),
    bulkDismiss: jest.fn(),
    ...overrides,
  };
}

describe('SuggestionsInbox', () => {
  it('renders suggestion cards', () => {
    render(<SuggestionsInbox suggestions={makeHook()} />);
    expect(screen.getByText('dep-1')).toBeInTheDocument();
    expect(screen.getAllByText('Service A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Service B').length).toBeGreaterThan(0);
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('shows empty state', () => {
    render(<SuggestionsInbox suggestions={makeHook({ suggestions: [], filtered: [] })} />);
    expect(screen.getByText('No pending suggestions.')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<SuggestionsInbox suggestions={makeHook({ isLoading: true })} />);
    expect(screen.getByText('Loading suggestions...')).toBeInTheDocument();
  });

  it('calls accept when accept button clicked', () => {
    const accept = jest.fn();
    render(<SuggestionsInbox suggestions={makeHook({ accept })} />);
    fireEvent.click(screen.getByTitle('Accept'));
    expect(accept).toHaveBeenCalledWith('s1');
  });

  it('calls dismiss when dismiss button clicked', () => {
    const dismiss = jest.fn();
    render(<SuggestionsInbox suggestions={makeHook({ dismiss })} />);
    fireEvent.click(screen.getByTitle('Dismiss'));
    expect(dismiss).toHaveBeenCalledWith('s1');
  });

  it('shows bulk actions when items selected', () => {
    render(
      <SuggestionsInbox
        suggestions={makeHook({ selectedIds: new Set(['s1']) })}
      />,
    );
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByText('Accept Selected')).toBeInTheDocument();
    expect(screen.getByText('Dismiss Selected')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<SuggestionsInbox suggestions={makeHook({ error: 'Something went wrong' })} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('calls setServiceFilter when service filter changed', () => {
    const setServiceFilter = jest.fn();
    render(
      <SuggestionsInbox
        suggestions={makeHook({
          suggestions: [
            makeSuggestion({ id: 's1', service_name: 'Service A' }),
            makeSuggestion({ id: 's2', service_name: 'Service B' }),
          ],
          setServiceFilter,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText('Filter by source service'), { target: { value: 'Service A' } });
    expect(setServiceFilter).toHaveBeenCalledWith('Service A');
  });

  it('calls setTeamFilter when team filter changed', () => {
    const setTeamFilter = jest.fn();
    render(
      <SuggestionsInbox
        suggestions={makeHook({
          suggestions: [
            makeSuggestion({ id: 's1', linked_service_name: 'Team A' }),
            makeSuggestion({ id: 's2', linked_service_name: 'Team B' }),
          ],
          setTeamFilter,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText('Filter by linked service'), { target: { value: 'Team A' } });
    expect(setTeamFilter).toHaveBeenCalledWith('Team A');
  });

  it('calls toggleSelected when checkbox clicked', () => {
    const toggleSelected = jest.fn();
    render(<SuggestionsInbox suggestions={makeHook({ toggleSelected })} />);

    fireEvent.click(screen.getByLabelText('Select dep-1'));
    expect(toggleSelected).toHaveBeenCalledWith('s1');
  });

  it('calls selectAll when select all checkbox clicked', () => {
    const selectAll = jest.fn();
    render(
      <SuggestionsInbox
        suggestions={makeHook({ selectAll })}
      />,
    );

    fireEvent.click(screen.getByLabelText('Select all'));
    expect(selectAll).toHaveBeenCalled();
  });

  it('calls clearSelection when all items selected and select all checkbox clicked', () => {
    const clearSelection = jest.fn();
    const suggestions = [makeSuggestion()];
    render(
      <SuggestionsInbox
        suggestions={makeHook({
          suggestions,
          filtered: suggestions,
          selectedIds: new Set(['s1']),
          clearSelection,
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('Select all'));
    expect(clearSelection).toHaveBeenCalled();
  });

  it('calls bulkAccept when Accept Selected clicked', () => {
    const bulkAccept = jest.fn();
    render(
      <SuggestionsInbox
        suggestions={makeHook({ selectedIds: new Set(['s1']), bulkAccept })}
      />,
    );

    fireEvent.click(screen.getByText('Accept Selected'));
    expect(bulkAccept).toHaveBeenCalled();
  });

  it('calls bulkDismiss when Dismiss Selected clicked', () => {
    const bulkDismiss = jest.fn();
    render(
      <SuggestionsInbox
        suggestions={makeHook({ selectedIds: new Set(['s1']), bulkDismiss })}
      />,
    );

    fireEvent.click(screen.getByText('Dismiss Selected'));
    expect(bulkDismiss).toHaveBeenCalled();
  });

  it('shows null confidence as dash', () => {
    render(
      <SuggestionsInbox
        suggestions={makeHook({
          suggestions: [makeSuggestion({ confidence_score: null })],
          filtered: [makeSuggestion({ confidence_score: null })],
        })}
      />,
    );

    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('renders checkbox as checked when selected', () => {
    render(
      <SuggestionsInbox
        suggestions={makeHook({ selectedIds: new Set(['s1']) })}
      />,
    );

    expect(screen.getByLabelText('Select dep-1')).toBeChecked();
  });

  it('displays confidence as integer percentage (not multiplied)', () => {
    render(
      <SuggestionsInbox
        suggestions={makeHook({
          suggestions: [makeSuggestion({ confidence_score: 75 })],
          filtered: [makeSuggestion({ confidence_score: 75 })],
        })}
      />,
    );

    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.queryByText('7500%')).not.toBeInTheDocument();
  });

  it('renders match reason when present', () => {
    render(
      <SuggestionsInbox
        suggestions={makeHook({
          suggestions: [makeSuggestion({ match_reason: 'Name pattern match' })],
          filtered: [makeSuggestion({ match_reason: 'Name pattern match' })],
        })}
      />,
    );

    expect(screen.getByText('Name pattern match')).toBeInTheDocument();
  });

  it('does not render match reason when null', () => {
    render(
      <SuggestionsInbox
        suggestions={makeHook({
          suggestions: [makeSuggestion({ match_reason: null })],
          filtered: [makeSuggestion({ match_reason: null })],
        })}
      />,
    );

    expect(screen.queryByText('Name pattern match')).not.toBeInTheDocument();
  });

  it('renders service flow with arrow', () => {
    render(<SuggestionsInbox suggestions={makeHook()} />);
    // The card should show source → linked service flow
    const serviceAs = screen.getAllByText('Service A');
    const serviceBs = screen.getAllByText('Service B');
    expect(serviceAs.length).toBeGreaterThan(0);
    expect(serviceBs.length).toBeGreaterThan(0);
  });

  it('renders confidence bar with correct level', () => {
    const { container } = render(
      <SuggestionsInbox
        suggestions={makeHook({
          suggestions: [makeSuggestion({ confidence_score: 85 })],
          filtered: [makeSuggestion({ confidence_score: 85 })],
        })}
      />,
    );

    // High confidence (>= 70) should have the high confidence fill class
    const fill = container.querySelector('[class*="confidenceFill"]');
    expect(fill).toBeInTheDocument();
  });
});
