import { useState, useEffect, useRef } from 'react';
import type {
  TeamManifestConfig,
  ManifestSyncResult as SyncResult,
  ManifestSyncSummary,
  ManifestSyncChange,
} from '../../../types/manifest';
import styles from './ManifestPage.module.css';

interface ManifestSyncResultProps {
  config: TeamManifestConfig;
  isSyncing: boolean;
  syncResult: SyncResult | null;
  onSync: () => Promise<SyncResult | null>;
  onClearSyncResult: () => void;
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatSyncSummaryText(summary: ManifestSyncSummary): string {
  const parts: string[] = [];
  if (summary.services.created > 0) parts.push(`Added ${summary.services.created}`);
  if (summary.services.updated > 0) parts.push(`updated ${summary.services.updated}`);
  if (summary.services.deactivated > 0) parts.push(`deactivated ${summary.services.deactivated}`);
  if (summary.services.deleted > 0) parts.push(`deleted ${summary.services.deleted}`);
  if (summary.services.drift_flagged > 0) parts.push(`${summary.services.drift_flagged} drift flags`);
  if (parts.length === 0) return 'No changes';
  return parts.join(', ');
}

const ACTION_ICONS: Record<string, { icon: string; className: string }> = {
  created: { icon: '+', className: styles.changeCreated },
  updated: { icon: '~', className: styles.changeUpdated },
  unchanged: { icon: '=', className: styles.changeUnchanged },
  drift_flagged: { icon: '⚠', className: styles.changeDrift },
  deactivated: { icon: '×', className: styles.changeRemoved },
  deleted: { icon: '×', className: styles.changeRemoved },
};

function ChangeList({ changes }: { changes: ManifestSyncChange[] }) {
  return (
    <div className={styles.changeList}>
      {changes.map((change, i) => {
        const { icon, className } = ACTION_ICONS[change.action] || { icon: '?', className: '' };
        return (
          <div key={`${change.manifest_key}-${i}`} className={styles.changeItem}>
            <span className={`${styles.changeIcon} ${className}`}>{icon}</span>
            <span>{change.service_name}</span>
            {change.fields_changed && change.fields_changed.length > 0 && (
              <span className={styles.changeFields}>
                ({change.fields_changed.join(', ')})
              </span>
            )}
            {change.drift_fields && change.drift_fields.length > 0 && (
              <span className={styles.changeFields}>
                (drift: {change.drift_fields.join(', ')})
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ManifestSyncResultComponent({
  config,
  isSyncing,
  syncResult,
  onSync,
  onClearSyncResult,
}: ManifestSyncResultProps) {
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncMessageType, setSyncMessageType] = useState<'success' | 'error'>('success');
  const [showDetails, setShowDetails] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss sync result banner after 8s
  useEffect(() => {
    if (syncMessage && syncMessageType === 'success') {
      dismissTimerRef.current = setTimeout(() => {
        setSyncMessage(null);
      }, 8000);
      return () => {
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      };
    }
  }, [syncMessage, syncMessageType]);

  const handleSync = async () => {
    setSyncMessage(null);
    const result = await onSync();
    if (result) {
      setSyncMessageType('success');
      setSyncMessage(formatSyncSummaryText(result.summary));
    } else {
      setSyncMessageType('error');
      setSyncMessage('Sync failed');
    }
  };

  const handleDismissBanner = () => {
    setSyncMessage(null);
    onClearSyncResult();
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  };

  // Parse last sync summary from config
  let lastSyncSummary: ManifestSyncSummary | null = null;
  if (config.last_sync_summary) {
    try {
      lastSyncSummary = JSON.parse(config.last_sync_summary);
    } catch {
      // Ignore parse errors
    }
  }

  const hasError = config.last_sync_status === 'failed';
  const isDisabled = !config.is_enabled;

  // Parse most recent sync changes from syncResult if available
  const recentChanges = syncResult?.changes || [];
  const recentWarnings = syncResult?.warnings || [];

  return (
    <div className={styles.syncCard}>
      <div className={styles.syncHeader}>
        <h3 className={styles.sectionTitle}>Last Sync Result</h3>
        {!isDisabled && (
          <button
            className={styles.syncButton}
            onClick={handleSync}
            disabled={isSyncing}
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        )}
      </div>

      {/* Sync result banner (after manual sync) */}
      {syncMessage && (
        <div
          className={`${styles.syncResultBanner} ${
            syncMessageType === 'success' ? styles.syncResultSuccess : styles.syncResultError
          }`}
        >
          <span>{syncMessage}</span>
          <button
            onClick={handleDismissBanner}
            className={styles.dismissBanner}
            aria-label="Dismiss sync result"
          >
            &times;
          </button>
        </div>
      )}

      {!config.last_sync_at ? (
        <div className={styles.noSyncs}>
          <p>No syncs yet. Click Sync Now to run the first sync.</p>
        </div>
      ) : (
        <>
          {/* Status line */}
          <div className={styles.syncStatus}>
            <span
              className={`${styles.statusDot} ${
                hasError
                  ? styles.statusDotError
                  : config.last_sync_status === 'partial'
                    ? styles.statusDotPartial
                    : styles.statusDotSuccess
              }`}
            />
            <span>{hasError ? 'Failed' : config.last_sync_status === 'partial' ? 'Partial' : 'Success'}</span>
            <span className={styles.syncMeta}>{formatTimeAgo(config.last_sync_at)}</span>
          </div>

          {/* Error detail */}
          {hasError && config.last_sync_error && (
            <div className={styles.syncError}>{config.last_sync_error}</div>
          )}

          {/* Summary counts */}
          {lastSyncSummary && !hasError && (
            <div className={styles.syncSummaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryValue}>{lastSyncSummary.services.created}</span>
                <span className={styles.summaryLabel}>Created</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryValue}>{lastSyncSummary.services.updated}</span>
                <span className={styles.summaryLabel}>Updated</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryValue}>{lastSyncSummary.services.unchanged}</span>
                <span className={styles.summaryLabel}>Unchanged</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryValue}>{lastSyncSummary.services.drift_flagged}</span>
                <span className={styles.summaryLabel}>Drift Flagged</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryValue}>{lastSyncSummary.services.deactivated}</span>
                <span className={styles.summaryLabel}>Deactivated</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryValue}>{lastSyncSummary.services.deleted}</span>
                <span className={styles.summaryLabel}>Deleted</span>
              </div>
            </div>
          )}

          {/* Expandable details */}
          {recentChanges.length > 0 && (
            <>
              <button
                className={styles.detailsToggle}
                onClick={() => setShowDetails(!showDetails)}
              >
                {showDetails ? '▾ Hide details' : '▸ Show details'}
              </button>
              {showDetails && (
                <>
                  <ChangeList changes={recentChanges} />
                  {recentWarnings.length > 0 && (
                    <div className={styles.warningsList}>
                      <strong>Warnings:</strong>
                      <ul>
                        {recentWarnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default ManifestSyncResultComponent;
