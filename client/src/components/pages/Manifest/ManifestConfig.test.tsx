import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ManifestConfig from './ManifestConfig';
import type { TeamManifestConfig, ManifestConfigInput } from '../../../types/manifest';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
});

const baseConfig: TeamManifestConfig = {
  id: 'mc1',
  team_id: 't1',
  manifest_url: 'https://example.com/manifest.json',
  is_enabled: 1,
  sync_policy: JSON.stringify({
    on_field_drift: 'flag',
    on_removal: 'flag',
  }),
  last_sync_at: new Date().toISOString(),
  last_sync_status: 'success',
  last_sync_error: null,
  last_sync_summary: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

function renderConfig(overrides: Partial<{
  config: Partial<TeamManifestConfig>;
  canManage: boolean;
  isSaving: boolean;
  onSave: (input: ManifestConfigInput) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
  onToggleEnabled: () => Promise<boolean>;
}> = {}) {
  const props = {
    config: { ...baseConfig, ...overrides.config },
    canManage: overrides.canManage ?? true,
    isSaving: overrides.isSaving ?? false,
    onSave: overrides.onSave ?? jest.fn().mockResolvedValue(true),
    onRemove: overrides.onRemove ?? jest.fn().mockResolvedValue(true),
    onToggleEnabled: overrides.onToggleEnabled ?? jest.fn().mockResolvedValue(true),
  };

  return { ...render(<MemoryRouter><ManifestConfig {...props} /></MemoryRouter>), props };
}

describe('ManifestConfig — display mode', () => {
  it('shows manifest URL', () => {
    renderConfig();
    expect(screen.getByText('https://example.com/manifest.json')).toBeInTheDocument();
  });

  it('shows enabled status', () => {
    renderConfig();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('shows disabled status', () => {
    renderConfig({ config: { is_enabled: 0 } });
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('shows sync policy labels', () => {
    renderConfig();
    const labels = screen.getAllByText('Flag for review');
    expect(labels.length).toBe(2); // field drift + removal policy both "flag"
  });

  it('shows manifest_wins policy label', () => {
    renderConfig({
      config: { sync_policy: JSON.stringify({ on_field_drift: 'manifest_wins', on_removal: 'deactivate' }) },
    });
    expect(screen.getByText('Use manifest value')).toBeInTheDocument();
    expect(screen.getByText('Deactivate service')).toBeInTheDocument();
  });

  it('shows action buttons for managers', () => {
    renderConfig();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Disable')).toBeInTheDocument();
    expect(screen.getByText('Remove Manifest')).toBeInTheDocument();
  });

  it('shows Enable button when disabled', () => {
    renderConfig({ config: { is_enabled: 0 } });
    expect(screen.getByText('Enable')).toBeInTheDocument();
  });

  it('hides action buttons for non-managers', () => {
    renderConfig({ canManage: false });
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Disable')).not.toBeInTheDocument();
    expect(screen.queryByText('Remove Manifest')).not.toBeInTheDocument();
  });

  it('calls toggleEnabled when Disable clicked', async () => {
    const onToggleEnabled = jest.fn().mockResolvedValue(true);
    renderConfig({ onToggleEnabled });

    fireEvent.click(screen.getByText('Disable'));
    expect(onToggleEnabled).toHaveBeenCalled();
  });

  it('handles null sync_policy gracefully', () => {
    renderConfig({ config: { sync_policy: null } });
    // Should show default "Flag for review" labels
    const labels = screen.getAllByText('Flag for review');
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ManifestConfig — edit mode', () => {
  it('enters edit mode when Edit clicked', () => {
    renderConfig();
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByLabelText('Manifest URL')).toBeInTheDocument();
    expect(screen.getByLabelText('On field drift')).toBeInTheDocument();
    expect(screen.getByLabelText('On service removal')).toBeInTheDocument();
  });

  it('pre-fills URL from config', () => {
    renderConfig();
    fireEvent.click(screen.getByText('Edit'));
    const urlInput = screen.getByLabelText('Manifest URL') as HTMLInputElement;
    expect(urlInput.value).toBe('https://example.com/manifest.json');
  });

  it('shows validation error for empty URL', async () => {
    renderConfig();
    fireEvent.click(screen.getByText('Edit'));

    const urlInput = screen.getByLabelText('Manifest URL');
    fireEvent.change(urlInput, { target: { value: '' } });
    fireEvent.click(screen.getByText('Save Configuration'));

    expect(screen.getByText('Manifest URL is required')).toBeInTheDocument();
  });

  it('shows validation error for invalid URL', async () => {
    renderConfig();
    fireEvent.click(screen.getByText('Edit'));

    const urlInput = screen.getByLabelText('Manifest URL');
    fireEvent.change(urlInput, { target: { value: 'not-a-url' } });
    fireEvent.click(screen.getByText('Save Configuration'));

    expect(screen.getByText('Please enter a valid HTTP or HTTPS URL')).toBeInTheDocument();
  });

  it('calls onSave with correct input on valid save', async () => {
    const onSave = jest.fn().mockResolvedValue(true);
    renderConfig({ onSave });

    fireEvent.click(screen.getByText('Edit'));

    const urlInput = screen.getByLabelText('Manifest URL');
    fireEvent.change(urlInput, { target: { value: 'https://new.example.com/manifest.json' } });
    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        manifest_url: 'https://new.example.com/manifest.json',
        sync_policy: {
          on_field_drift: 'flag',
          on_removal: 'flag',
        },
      });
    });
  });

  it('exits edit mode on successful save', async () => {
    const onSave = jest.fn().mockResolvedValue(true);
    renderConfig({ onSave });

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      expect(screen.queryByLabelText('Manifest URL')).not.toBeInTheDocument();
    });
  });

  it('stays in edit mode on failed save', async () => {
    const onSave = jest.fn().mockResolvedValue(false);
    renderConfig({ onSave });

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      expect(screen.getByLabelText('Manifest URL')).toBeInTheDocument();
    });
  });

  it('exits edit mode on Cancel click', () => {
    renderConfig();
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByLabelText('Manifest URL')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByLabelText('Manifest URL')).not.toBeInTheDocument();
  });

  it('shows delete warning when delete policy selected', () => {
    renderConfig();
    fireEvent.click(screen.getByText('Edit'));

    const removalSelect = screen.getByLabelText('On service removal');
    fireEvent.change(removalSelect, { target: { value: 'delete' } });

    expect(screen.getByText('Warning: Deleted services cannot be recovered')).toBeInTheDocument();
  });

  it('shows ... on toggle button when isSaving', () => {
    renderConfig({ isSaving: true });
    // When isSaving, the toggle button shows "..." instead of Disable/Enable
    expect(screen.getByText('...')).toBeInTheDocument();
    // All action buttons are disabled
    expect(screen.getByText('Edit')).toBeDisabled();
    expect(screen.getByText('Remove Manifest')).toBeDisabled();
  });
});

describe('ManifestConfig — remove', () => {
  it('opens confirm dialog on Remove Manifest click', () => {
    renderConfig();
    fireEvent.click(screen.getByText('Remove Manifest'));
    expect(screen.getByText('Remove Manifest', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to remove/)).toBeInTheDocument();
  });

  it('calls onRemove when confirmed', async () => {
    const onRemove = jest.fn().mockResolvedValue(true);
    renderConfig({ onRemove });

    fireEvent.click(screen.getByText('Remove Manifest'));
    fireEvent.click(screen.getByText('Remove'));

    await waitFor(() => {
      expect(onRemove).toHaveBeenCalled();
    });
  });
});
