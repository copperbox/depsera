import { useState, useEffect, useCallback } from 'react';
import { Key, Trash2, Copy, Check, Plus, Lock, Pencil } from 'lucide-react';
import { listApiKeys, createApiKey, deleteApiKey } from '../../../api/apiKeys';
import type { ApiKey } from '../../../api/apiKeys';
import { updateApiKeyRateLimit } from '../../../api/otlpStats';
import { formatRelativeTime } from '../../../utils/formatting';
import ConfirmDialog from '../../common/ConfirmDialog';
import Modal from '../../common/Modal';
import styles from './Teams.module.css';
import apiKeyStyles from './ApiKeys.module.css';

const DEFAULT_RATE_LIMIT_RPM = 150_000;

interface ApiKeysProps {
  teamId: string;
  canManage: boolean;
}

function ApiKeys({ teamId, canManage }: ApiKeysProps) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Rate limit edit dialog state
  const [editRateLimitKey, setEditRateLimitKey] = useState<ApiKey | null>(null);
  const [rateLimitInput, setRateLimitInput] = useState('');
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [isSavingRateLimit, setIsSavingRateLimit] = useState(false);

  const loadKeys = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await listApiKeys(teamId);
      setKeys(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load API keys');
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    try {
      setIsCreating(true);
      const result = await createApiKey(teamId, newKeyName.trim());
      setRevealedKey(result.rawKey);
      setNewKeyName('');
      setShowCreateForm(false);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteKeyId) return;
    try {
      setIsDeleting(true);
      await deleteApiKey(teamId, deleteKeyId);
      setDeleteKeyId(null);
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete API key');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text
    }
  };

  const dismissRevealedKey = () => {
    setRevealedKey(null);
  };

  const openRateLimitDialog = (key: ApiKey) => {
    setEditRateLimitKey(key);
    setRateLimitInput(key.rate_limit_rpm !== null ? String(key.rate_limit_rpm) : '');
    setRateLimitError(null);
  };

  const closeRateLimitDialog = () => {
    setEditRateLimitKey(null);
    setRateLimitInput('');
    setRateLimitError(null);
  };

  const validateRateLimitInput = (value: string): string | null => {
    if (value === '') return null; // empty = will reset to default
    const num = Number(value);
    if (!Number.isInteger(num) || num <= 0) return 'Must be a positive integer';
    if (num > 1_500_000) return 'Cannot exceed 1,500,000 req/min';
    return null;
  };

  const handleSaveRateLimit = async () => {
    if (!editRateLimitKey) return;
    const trimmed = rateLimitInput.trim();
    const validationError = validateRateLimitInput(trimmed);
    if (validationError) {
      setRateLimitError(validationError);
      return;
    }
    const newLimit = trimmed === '' ? null : Number(trimmed);
    try {
      setIsSavingRateLimit(true);
      await updateApiKeyRateLimit(teamId, editRateLimitKey.id, newLimit);
      closeRateLimitDialog();
      await loadKeys();
    } catch (err) {
      setRateLimitError(err instanceof Error ? err.message : 'Failed to update rate limit');
    } finally {
      setIsSavingRateLimit(false);
    }
  };

  const handleResetToDefault = async () => {
    if (!editRateLimitKey) return;
    try {
      setIsSavingRateLimit(true);
      await updateApiKeyRateLimit(teamId, editRateLimitKey.id, null);
      closeRateLimitDialog();
      await loadKeys();
    } catch (err) {
      setRateLimitError(err instanceof Error ? err.message : 'Failed to reset rate limit');
    } finally {
      setIsSavingRateLimit(false);
    }
  };

  const getEffectiveRateLimit = (key: ApiKey): number => {
    return key.rate_limit_rpm ?? DEFAULT_RATE_LIMIT_RPM;
  };

  const isCustomRateLimit = (key: ApiKey): boolean => {
    return key.rate_limit_rpm !== null;
  };

  const isAdminLocked = (key: ApiKey): boolean => {
    return key.rate_limit_admin_locked === 1;
  };

  if (isLoading) {
    return (
      <div className={apiKeyStyles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading API keys...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={apiKeyStyles.container}>
      <div className={apiKeyStyles.header}>
        <div>
          <h3 className={apiKeyStyles.title}>API Keys</h3>
          <p className={apiKeyStyles.subtitle}>
            Authenticate OTLP metric pushes from your collectors.
          </p>
        </div>
        {canManage && !showCreateForm && !revealedKey && (
          <button
            onClick={() => setShowCreateForm(true)}
            className={apiKeyStyles.createButton}
          >
            <Plus size={14} />
            Create Key
          </button>
        )}
      </div>

      {error && (
        <div className={styles.error} style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {revealedKey && (
        <div className={apiKeyStyles.revealedKeyCard}>
          <div className={apiKeyStyles.revealedKeyHeader}>
            <Key size={16} />
            <strong>API Key Created</strong>
          </div>
          <p className={apiKeyStyles.revealedKeyWarning}>
            Copy this key now. It will not be shown again.
          </p>
          <div className={apiKeyStyles.revealedKeyValue}>
            <code>{revealedKey}</code>
            <button
              onClick={() => handleCopy(revealedKey)}
              className={apiKeyStyles.copyButton}
              title="Copy to clipboard"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <button onClick={dismissRevealedKey} className={apiKeyStyles.dismissButton}>
            Done
          </button>
        </div>
      )}

      {canManage && showCreateForm && (
        <div className={apiKeyStyles.createForm}>
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g., Production Collector)"
            className={apiKeyStyles.nameInput}
            disabled={isCreating}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
          />
          <div className={apiKeyStyles.createActions}>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setNewKeyName('');
              }}
              className={apiKeyStyles.cancelButton}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newKeyName.trim() || isCreating}
              className={apiKeyStyles.generateButton}
            >
              {isCreating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <div className={apiKeyStyles.emptyState}>
          <Key size={24} className={apiKeyStyles.emptyIcon} />
          <p>No API keys yet.</p>
          {canManage && <p className={apiKeyStyles.emptyHint}>Create a key to start pushing OTLP metrics.</p>}
        </div>
      ) : (
        <div className={apiKeyStyles.keyList}>
          {keys.map((key) => (
            <div key={key.id} className={apiKeyStyles.keyItem}>
              <div className={apiKeyStyles.keyInfo}>
                <span className={apiKeyStyles.keyName}>{key.name}</span>
                <code className={apiKeyStyles.keyPrefix}>{key.key_prefix}...</code>
              </div>
              <div className={apiKeyStyles.rateLimit}>
                <span className={apiKeyStyles.rateLimitValue}>
                  {key.rate_limit_rpm === 0
                    ? 'Unlimited'
                    : `${getEffectiveRateLimit(key).toLocaleString()} req/min`}
                </span>
                <span className={apiKeyStyles.rateLimitLabel}>
                  {key.rate_limit_rpm === 0
                    ? '(admin)'
                    : isCustomRateLimit(key) ? '(custom)' : '(default)'}
                </span>
                {isAdminLocked(key) && (
                  <span title="Locked by admin">
                    <Lock size={12} className={apiKeyStyles.lockIcon} />
                  </span>
                )}
                {canManage && !isAdminLocked(key) && key.rate_limit_rpm !== 0 && (
                  <button
                    onClick={() => openRateLimitDialog(key)}
                    className={apiKeyStyles.editButton}
                    title="Edit rate limit"
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>
              <div className={apiKeyStyles.keyMeta}>
                <span>Created {formatRelativeTime(key.created_at)}</span>
                <span>{key.last_used_at ? `Last used ${formatRelativeTime(key.last_used_at)}` : 'Never used'}</span>
              </div>
              {canManage && (
                <button
                  onClick={() => setDeleteKeyId(key.id)}
                  className={apiKeyStyles.deleteButton}
                  title="Revoke key"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={apiKeyStyles.helpSection}>
        <h4 className={apiKeyStyles.helpTitle}>Collector Configuration</h4>
        <pre className={apiKeyStyles.codeBlock}>
{`exporters:
  otlphttp:
    endpoint: "https://<depsera-host>/v1/metrics"
    headers:
      Authorization: "Bearer dps_..."`}
        </pre>
      </div>

      <ConfirmDialog
        isOpen={!!deleteKeyId}
        onClose={() => setDeleteKeyId(null)}
        onConfirm={handleDelete}
        title="Revoke API Key"
        message="Are you sure you want to revoke this API key? Any collectors using it will no longer be able to push metrics."
        confirmLabel="Revoke"
        isDestructive
        isLoading={isDeleting}
      />

      <Modal
        isOpen={!!editRateLimitKey}
        onClose={closeRateLimitDialog}
        title="Edit Rate Limit"
        size="sm"
      >
        {editRateLimitKey && (
          <div className={apiKeyStyles.rateLimitDialog}>
            <p className={apiKeyStyles.rateLimitDialogDesc}>
              Set the rate limit for <strong>{editRateLimitKey.name}</strong> ({editRateLimitKey.key_prefix}...).
              Leave empty to use the system default ({DEFAULT_RATE_LIMIT_RPM.toLocaleString()} req/min).
            </p>
            <label className={apiKeyStyles.rateLimitDialogLabel}>
              Rate limit (req/min)
            </label>
            <input
              type="number"
              value={rateLimitInput}
              onChange={(e) => {
                setRateLimitInput(e.target.value);
                setRateLimitError(null);
              }}
              placeholder={String(DEFAULT_RATE_LIMIT_RPM)}
              className={apiKeyStyles.nameInput}
              min={1}
              disabled={isSavingRateLimit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRateLimit();
              }}
            />
            {rateLimitError && (
              <p className={apiKeyStyles.rateLimitDialogError}>{rateLimitError}</p>
            )}
            <div className={apiKeyStyles.rateLimitDialogActions}>
              <button
                onClick={handleResetToDefault}
                className={apiKeyStyles.cancelButton}
                disabled={isSavingRateLimit || !isCustomRateLimit(editRateLimitKey)}
              >
                Reset to default
              </button>
              <div className={apiKeyStyles.rateLimitDialogRight}>
                <button
                  onClick={closeRateLimitDialog}
                  className={apiKeyStyles.cancelButton}
                  disabled={isSavingRateLimit}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRateLimit}
                  className={apiKeyStyles.generateButton}
                  disabled={isSavingRateLimit || !!validateRateLimitInput(rateLimitInput.trim())}
                >
                  {isSavingRateLimit ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default ApiKeys;
