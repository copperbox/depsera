import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { useManifestConfigs } from '../../../hooks/useManifestConfigs';
import { formatRelativeTime } from '../../../utils/formatting';
import type { ManifestConfigInput, TeamManifestConfig } from '../../../types/manifest';
import ManifestConfig from './ManifestConfig';
import styles from './ManifestPage.module.css';

interface ManifestListProps {
  teamId: string;
  canManage: boolean;
}

function truncateUrl(url: string, maxLen = 50): string {
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen - 3) + '...';
}

function getStatusBadgeStyle(status: string | null): string {
  switch (status) {
    case 'success': return styles.statusDotSuccess;
    case 'failed': return styles.statusDotError;
    case 'partial': return styles.statusDotPartial;
    default: return '';
  }
}

function ManifestList({ teamId, canManage }: ManifestListProps) {
  const navigate = useNavigate();
  const {
    configs,
    isLoading,
    error,
    isCreating,
    loadConfigs,
    createConfig,
    clearError,
  } = useManifestConfigs(teamId);

  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const handleCreate = async (input: ManifestConfigInput): Promise<boolean> => {
    const result = await createConfig(input);
    if (result) {
      setShowCreateForm(false);
      // Navigate to the new config detail
      navigate(`/teams/${teamId}/manifest/${result.id}`);
      return true;
    }
    return false;
  };

  const serviceCountFromSummary = (config: TeamManifestConfig): number | null => {
    if (!config.last_sync_summary) return null;
    try {
      const summary = JSON.parse(config.last_sync_summary);
      return (
        summary.services.created +
        summary.services.updated +
        summary.services.unchanged +
        summary.services.drift_flagged
      );
    } catch {
      return null;
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Loader2 size={24} className={styles.spinner} />
        <span>Loading manifest configs...</span>
      </div>
    );
  }

  if (error && configs.length === 0 && !showCreateForm) {
    return (
      <div className={styles.error}>
        <p>{error}</p>
        <button onClick={loadConfigs} className={styles.retryButton}>Retry</button>
      </div>
    );
  }

  // Empty state
  if (configs.length === 0 && !showCreateForm) {
    return (
      <div className={styles.emptyState}>
        <p>
          No manifests configured for this team. A manifest lets you declaratively define services, aliases,
          and associations using a JSON file. Changes are automatically synced and manual edits are detected as drift.
        </p>
        {canManage && (
          <button className={styles.configureButton} onClick={() => setShowCreateForm(true)}>
            <Plus size={16} />
            Add Manifest
          </button>
        )}
      </div>
    );
  }

  // Create form
  if (showCreateForm) {
    return (
      <div className={styles.section}>
        {error && (
          <div className={styles.errorBanner}>
            {error}
            <button
              onClick={clearError}
              style={{ marginLeft: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 600 }}
            >
              &times;
            </button>
          </div>
        )}
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>New Manifest</h2>
        </div>
        <ManifestConfig
          config={null}
          canManage={canManage}
          isSaving={isCreating}
          isNew
          onSave={handleCreate}
          onRemove={async () => false}
          onToggleEnabled={async () => false}
          onCancelCreate={() => setShowCreateForm(false)}
        />
      </div>
    );
  }

  // List view
  return (
    <div>
      {error && (
        <div className={styles.errorBanner}>
          {error}
          <button
            onClick={clearError}
            style={{ marginLeft: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 600 }}
          >
            &times;
          </button>
        </div>
      )}

      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Manifests ({configs.length})</h2>
        {canManage && configs.length < 20 && (
          <button className={styles.configureButton} onClick={() => setShowCreateForm(true)}>
            <Plus size={14} />
            Add Manifest
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {configs.map((config, idx) => {
          const serviceCount = serviceCountFromSummary(config);
          const isDisabled = !config.is_enabled;
          const hasError = config.last_sync_status === 'failed';

          return (
            <div
              key={config.id}
              onClick={() => navigate(`/teams/${teamId}/manifest/${config.id}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                padding: 'var(--space-4) var(--space-5)',
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderBottom: idx < configs.length - 1 ? 'none' : '1px solid var(--color-border)',
                borderRadius: idx === 0 && configs.length === 1
                  ? 'var(--radius-lg)'
                  : idx === 0
                    ? 'var(--radius-lg) var(--radius-lg) 0 0'
                    : idx === configs.length - 1
                      ? '0 0 var(--radius-lg) var(--radius-lg)'
                      : '0',
                cursor: 'pointer',
                transition: 'background-color var(--duration-fast)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-surface)'; }}
            >
              {/* Name */}
              <div style={{ minWidth: '8rem', fontWeight: 'var(--font-medium)' as unknown as number, color: 'var(--color-text)' }}>
                {config.name}
              </div>

              {/* URL */}
              <div style={{ flex: 1, color: 'var(--color-text-muted)', fontSize: 'var(--font-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={config.manifest_url}>
                {truncateUrl(config.manifest_url)}
              </div>

              {/* Enabled/Disabled */}
              <div>
                <span style={{
                  display: 'inline-block',
                  padding: '0.125rem 0.5rem',
                  fontSize: 'var(--font-xs)',
                  fontWeight: 500,
                  borderRadius: '9999px',
                  color: isDisabled ? 'var(--color-text-muted)' : 'var(--color-healthy)',
                  backgroundColor: isDisabled ? 'var(--color-surface-hover)' : 'color-mix(in srgb, var(--color-healthy) 10%, transparent)',
                }}>
                  {isDisabled ? 'Disabled' : 'Enabled'}
                </span>
              </div>

              {/* Last Sync */}
              <div style={{ minWidth: '6rem', textAlign: 'right', fontSize: 'var(--font-sm)' }}>
                {config.last_sync_at ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-1)' }}>
                    <span className={`${styles.statusDot} ${getStatusBadgeStyle(config.last_sync_status)}`} />
                    <span style={{ color: hasError ? 'var(--color-critical)' : 'var(--color-text-muted)' }}>
                      {formatRelativeTime(config.last_sync_at)}
                    </span>
                  </span>
                ) : (
                  <span style={{ color: 'var(--color-text-muted)' }}>Never</span>
                )}
              </div>

              {/* Service Count */}
              <div style={{ minWidth: '4rem', textAlign: 'right', fontSize: 'var(--font-sm)', color: 'var(--color-text-muted)' }}>
                {serviceCount !== null ? `${serviceCount} svc` : '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ManifestList;
