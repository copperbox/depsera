import { render, screen, fireEvent, act } from '@testing-library/react';
import DriftFlagCard from './DriftFlagCard';
import type { DriftFlagWithContext } from '../../../types/manifest';

const baseFlag: DriftFlagWithContext = {
  id: 'df1',
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
};

function renderCard(overrides: Partial<{
  flag: Partial<DriftFlagWithContext>;
  isSelected: boolean;
  canManage: boolean;
  onToggleSelect: (id: string) => void;
  onAccept: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onReopen: (id: string) => Promise<void>;
}> = {}) {
  const props = {
    flag: { ...baseFlag, ...overrides.flag } as DriftFlagWithContext,
    isSelected: overrides.isSelected ?? false,
    canManage: overrides.canManage ?? true,
    onToggleSelect: overrides.onToggleSelect ?? jest.fn(),
    onAccept: overrides.onAccept ?? jest.fn().mockResolvedValue(undefined),
    onDismiss: overrides.onDismiss ?? jest.fn().mockResolvedValue(undefined),
    onReopen: overrides.onReopen ?? jest.fn().mockResolvedValue(undefined),
  };
  return { ...render(<DriftFlagCard {...props} />), props };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('DriftFlagCard', () => {
  describe('field change card', () => {
    it('shows service name and manifest key', () => {
      renderCard();
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
      expect(screen.getByText('auth-svc')).toBeInTheDocument();
    });

    it('shows Field Change badge', () => {
      renderCard();
      expect(screen.getByText('Field Change')).toBeInTheDocument();
    });

    it('shows formatted field name', () => {
      renderCard();
      expect(screen.getByText('Health Endpoint')).toBeInTheDocument();
    });

    it('shows current and manifest values', () => {
      renderCard();
      expect(screen.getByText('/health')).toBeInTheDocument();
      expect(screen.getByText('/healthz')).toBeInTheDocument();
      expect(screen.getByText('Current')).toBeInTheDocument();
      expect(screen.getByText('Manifest')).toBeInTheDocument();
    });

    it('formats poll_interval_ms values', () => {
      renderCard({
        flag: {
          field_name: 'poll_interval_ms',
          current_value: '5000',
          manifest_value: '30000',
        },
      });
      expect(screen.getByText('5s')).toBeInTheDocument();
      expect(screen.getByText('30s')).toBeInTheDocument();
    });

    it('shows (empty) for null values', () => {
      renderCard({
        flag: { current_value: null },
      });
      expect(screen.getByText('(empty)')).toBeInTheDocument();
    });

    it('shows schema_config as "Schema changed"', () => {
      renderCard({
        flag: {
          field_name: 'schema_config',
          current_value: '{}',
          manifest_value: '{"type": "new"}',
        },
      });
      expect(screen.getAllByText('Schema changed')).toHaveLength(2);
    });

    it('shows timestamps', () => {
      renderCard();
      expect(screen.getByText(/Jun 10, 2024/)).toBeInTheDocument();
    });

    it('shows Accept and Dismiss buttons', () => {
      renderCard();
      expect(screen.getByText('Accept')).toBeInTheDocument();
      expect(screen.getByText('Dismiss')).toBeInTheDocument();
    });

    it('calls onAccept when Accept clicked', async () => {
      const onAccept = jest.fn().mockResolvedValue(undefined);
      renderCard({ onAccept });

      await act(async () => {
        fireEvent.click(screen.getByText('Accept'));
      });

      expect(onAccept).toHaveBeenCalledWith('df1');
    });

    it('calls onDismiss when Dismiss clicked', async () => {
      const onDismiss = jest.fn().mockResolvedValue(undefined);
      renderCard({ onDismiss });

      await act(async () => {
        fireEvent.click(screen.getByText('Dismiss'));
      });

      expect(onDismiss).toHaveBeenCalledWith('df1');
    });
  });

  describe('service removal card', () => {
    it('shows Service Removal badge', () => {
      renderCard({
        flag: {
          drift_type: 'service_removal',
          field_name: null,
          manifest_value: null,
          current_value: null,
        },
      });
      expect(screen.getByText('Service Removal')).toBeInTheDocument();
    });

    it('shows removal message', () => {
      renderCard({
        flag: {
          drift_type: 'service_removal',
          field_name: null,
          manifest_value: null,
          current_value: null,
        },
      });
      expect(screen.getByText('This service is no longer in the manifest.')).toBeInTheDocument();
    });

    it('shows Accept (Deactivate) label', () => {
      renderCard({
        flag: {
          drift_type: 'service_removal',
          field_name: null,
          manifest_value: null,
          current_value: null,
        },
      });
      expect(screen.getByText('Accept (Deactivate)')).toBeInTheDocument();
    });

    it('requires inline confirmation for accept', async () => {
      const onAccept = jest.fn().mockResolvedValue(undefined);
      renderCard({
        flag: {
          drift_type: 'service_removal',
          field_name: null,
          manifest_value: null,
          current_value: null,
        },
        onAccept,
      });

      // First click shows confirmation
      fireEvent.click(screen.getByText('Accept (Deactivate)'));
      expect(screen.getByText('Confirm deactivation?')).toBeInTheDocument();
      expect(onAccept).not.toHaveBeenCalled();

      // Second click confirms
      await act(async () => {
        fireEvent.click(screen.getByText('Yes, deactivate'));
      });
      expect(onAccept).toHaveBeenCalledWith('df1');
    });

    it('cancels inline confirmation', () => {
      renderCard({
        flag: {
          drift_type: 'service_removal',
          field_name: null,
          manifest_value: null,
          current_value: null,
        },
      });

      fireEvent.click(screen.getByText('Accept (Deactivate)'));
      expect(screen.getByText('Confirm deactivation?')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Cancel'));
      expect(screen.queryByText('Confirm deactivation?')).not.toBeInTheDocument();
    });

    it('auto-dismisses confirmation after 3s', () => {
      renderCard({
        flag: {
          drift_type: 'service_removal',
          field_name: null,
          manifest_value: null,
          current_value: null,
        },
      });

      fireEvent.click(screen.getByText('Accept (Deactivate)'));
      expect(screen.getByText('Confirm deactivation?')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(3000);
      });
      expect(screen.queryByText('Confirm deactivation?')).not.toBeInTheDocument();
    });
  });

  describe('dismissed state', () => {
    it('shows Re-open and Accept buttons for dismissed flags', () => {
      renderCard({
        flag: { status: 'dismissed' },
      });
      expect(screen.getByText('Re-open')).toBeInTheDocument();
      expect(screen.getByText('Accept')).toBeInTheDocument();
      expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
    });

    it('shows dismissed by info', () => {
      renderCard({
        flag: {
          status: 'dismissed',
          resolved_by_name: 'Jane Doe',
          resolved_at: '2024-06-14T10:00:00Z',
        },
      });
      expect(screen.getByText(/Dismissed by Jane Doe/)).toBeInTheDocument();
    });

    it('calls onReopen when Re-open clicked', async () => {
      const onReopen = jest.fn().mockResolvedValue(undefined);
      renderCard({
        flag: { status: 'dismissed' },
        onReopen,
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Re-open'));
      });

      expect(onReopen).toHaveBeenCalledWith('df1');
    });
  });

  describe('permissions', () => {
    it('hides checkbox when canManage is false', () => {
      renderCard({ canManage: false });
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('hides action buttons when canManage is false', () => {
      renderCard({ canManage: false });
      expect(screen.queryByText('Accept')).not.toBeInTheDocument();
      expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
    });

    it('shows checkbox when canManage is true', () => {
      renderCard({ canManage: true });
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('calls onToggleSelect when checkbox toggled', () => {
      const onToggleSelect = jest.fn();
      renderCard({ onToggleSelect });

      fireEvent.click(screen.getByRole('checkbox'));
      expect(onToggleSelect).toHaveBeenCalledWith('df1');
    });

    it('renders checkbox as checked when isSelected', () => {
      renderCard({ isSelected: true });
      expect(screen.getByRole('checkbox')).toBeChecked();
    });
  });

  describe('unknown field name', () => {
    it('shows raw field name for unrecognized fields', () => {
      renderCard({ flag: { field_name: 'custom_field' } });
      expect(screen.getByText('custom_field')).toBeInTheDocument();
    });

    it('shows "Unknown field" for null field name', () => {
      renderCard({
        flag: {
          drift_type: 'field_change',
          field_name: null,
        },
      });
      expect(screen.getByText('Unknown field')).toBeInTheDocument();
    });
  });
});
