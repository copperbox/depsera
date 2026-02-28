import { useState } from 'react';
import ConfirmDialog from '../../common/ConfirmDialog';
import type { TeamManifestConfig, ManifestConfigInput, ManifestSyncPolicy } from '../../../types/manifest';
import styles from './ManifestPage.module.css';

interface ManifestConfigProps {
  config: TeamManifestConfig;
  canManage: boolean;
  isSaving: boolean;
  onSave: (input: ManifestConfigInput) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
  onToggleEnabled: () => Promise<boolean>;
}

const FIELD_DRIFT_LABELS: Record<string, string> = {
  flag: 'Flag for review',
  manifest_wins: 'Use manifest value',
  local_wins: 'Keep local value',
};

const REMOVAL_LABELS: Record<string, string> = {
  flag: 'Flag for review',
  deactivate: 'Deactivate service',
  delete: 'Delete service',
};

function parseSyncPolicy(raw: string | null): Partial<ManifestSyncPolicy> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function ManifestConfig({
  config,
  canManage,
  isSaving,
  onSave,
  onRemove,
  onToggleEnabled,
}: ManifestConfigProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);

  // Form state
  const policy = parseSyncPolicy(config.sync_policy);
  const [formUrl, setFormUrl] = useState(config.manifest_url);
  const [formFieldDrift, setFormFieldDrift] = useState(policy.on_field_drift || 'flag');
  const [formRemoval, setFormRemoval] = useState(policy.on_removal || 'flag');
  const [urlError, setUrlError] = useState<string | null>(null);

  const handleEdit = () => {
    const p = parseSyncPolicy(config.sync_policy);
    setFormUrl(config.manifest_url);
    setFormFieldDrift(p.on_field_drift || 'flag');
    setFormRemoval(p.on_removal || 'flag');
    setUrlError(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setUrlError(null);
  };

  const handleSave = async () => {
    const trimmedUrl = formUrl.trim();
    if (!trimmedUrl) {
      setUrlError('Manifest URL is required');
      return;
    }
    if (!isValidUrl(trimmedUrl)) {
      setUrlError('Please enter a valid HTTP or HTTPS URL');
      return;
    }

    const input: ManifestConfigInput = {
      manifest_url: trimmedUrl,
      sync_policy: {
        on_field_drift: formFieldDrift,
        on_removal: formRemoval,
      },
    };

    const success = await onSave(input);
    if (success) {
      setIsEditing(false);
    }
  };

  const handleRemove = async () => {
    const success = await onRemove();
    if (success) {
      setIsRemoveDialogOpen(false);
    }
  };

  if (isEditing) {
    return (
      <div className={styles.configCard}>
        <div className={styles.configForm}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="manifest-url">
              Manifest URL
            </label>
            <input
              id="manifest-url"
              type="url"
              className={`${styles.input} ${urlError ? styles.inputError : ''}`}
              value={formUrl}
              onChange={(e) => {
                setFormUrl(e.target.value);
                setUrlError(null);
              }}
              placeholder="https://example.com/manifest.json"
              required
            />
            {urlError && <span className={styles.fieldError}>{urlError}</span>}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="field-drift-policy">
              On field drift
            </label>
            <select
              id="field-drift-policy"
              className={styles.select}
              value={formFieldDrift}
              onChange={(e) => setFormFieldDrift(e.target.value as ManifestSyncPolicy['on_field_drift'])}
            >
              <option value="flag">Flag for review — create a drift flag for manual review</option>
              <option value="manifest_wins">Use manifest value — auto-apply the manifest value</option>
              <option value="local_wins">Keep local value — ignore the difference</option>
            </select>
            <span className={styles.fieldHint}>
              What happens when a service field was manually changed since the last sync
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="removal-policy">
              On service removal
            </label>
            <select
              id="removal-policy"
              className={styles.select}
              value={formRemoval}
              onChange={(e) => setFormRemoval(e.target.value as ManifestSyncPolicy['on_removal'])}
            >
              <option value="flag">Flag for review — create a drift flag for manual review</option>
              <option value="deactivate">Deactivate service — mark as inactive, stop polling</option>
              <option value="delete">Delete service — permanently remove the service</option>
            </select>
            <span className={styles.fieldHint}>
              What happens when a service is no longer in the manifest
            </span>
            {formRemoval === 'delete' && (
              <span className={styles.deleteWarning}>
                Warning: Deleted services cannot be recovered
              </span>
            )}
          </div>

          <div className={styles.formActions}>
            <button
              className={styles.saveButton}
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
            <button
              className={styles.cancelButton}
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Display mode
  const isEnabled = config.is_enabled === 1;

  return (
    <>
      <div className={styles.configCard}>
        <div className={styles.configRow}>
          <span className={styles.configLabel}>URL</span>
          <span className={styles.configValue}>
            <code>{config.manifest_url}</code>
          </span>
        </div>

        <div className={styles.configRow}>
          <span className={styles.configLabel}>Status</span>
          <span className={`${styles.configValue} ${isEnabled ? styles.statusEnabled : styles.statusDisabled}`}>
            {isEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        <div className={styles.configRow}>
          <span className={styles.configLabel}>Field drift</span>
          <span className={styles.configValue}>
            <span className={styles.policyLabel}>
              {FIELD_DRIFT_LABELS[policy.on_field_drift || 'flag'] || 'Flag for review'}
            </span>
          </span>
        </div>

        <div className={styles.configRow}>
          <span className={styles.configLabel}>Removal</span>
          <span className={styles.configValue}>
            <span className={styles.policyLabel}>
              {REMOVAL_LABELS[policy.on_removal || 'flag'] || 'Flag for review'}
            </span>
          </span>
        </div>

        {canManage && (
          <div className={styles.configActions}>
            <button
              className={`${styles.actionButton} ${styles.editButton}`}
              onClick={handleEdit}
              disabled={isSaving}
            >
              Edit
            </button>
            <button
              className={`${styles.actionButton} ${styles.disableButton}`}
              onClick={onToggleEnabled}
              disabled={isSaving}
            >
              {isSaving ? '...' : isEnabled ? 'Disable' : 'Enable'}
            </button>
            <button
              className={`${styles.actionButton} ${styles.removeButton}`}
              onClick={() => setIsRemoveDialogOpen(true)}
              disabled={isSaving}
            >
              Remove Manifest
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={isRemoveDialogOpen}
        onClose={() => setIsRemoveDialogOpen(false)}
        onConfirm={handleRemove}
        title="Remove Manifest"
        message="Are you sure you want to remove the manifest configuration? Existing services will not be deleted, but syncing will stop."
        confirmLabel="Remove"
        isDestructive
        isLoading={isSaving}
      />
    </>
  );
}

export default ManifestConfig;
