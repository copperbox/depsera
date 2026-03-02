import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useManifestConfig } from '../../../hooks/useManifestConfig';
import { getDriftSummary } from '../../../api/manifest';
import type { DriftSummary, ManifestSyncSummary } from '../../../types/manifest';
import styles from './ManifestStatusCard.module.css';
import teamStyles from './Teams.module.css';

const SYNC_COOLDOWN_MS = 60_000;

interface ManifestStatusCardProps {
  teamId: string;
  canManage: boolean;
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

function formatSyncSummary(summary: ManifestSyncSummary): string {
  const parts: string[] = [];
  if (summary.services.created > 0) parts.push(`Added ${summary.services.created}`);
  if (summary.services.updated > 0) parts.push(`updated ${summary.services.updated}`);
  if (summary.services.deactivated > 0) parts.push(`deactivated ${summary.services.deactivated}`);
  if (summary.services.deleted > 0) parts.push(`deleted ${summary.services.deleted}`);
  if (summary.services.drift_flagged > 0) parts.push(`${summary.services.drift_flagged} drift flags`);
  if (parts.length === 0) return 'No changes';
  return parts.join(', ');
}

function truncateUrl(url: string, maxLen = 60): string {
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen - 3) + '...';
}

function ManifestStatusCard({ teamId, canManage }: ManifestStatusCardProps) {
  const {
    config,
    isLoading,
    error: hookError,
    isSyncing,
    loadConfig,
    triggerSync,
    clearSyncResult,
  } = useManifestConfig(teamId);

  const [driftSummary, setDriftSummary] = useState<DriftSummary | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncMessageType, setSyncMessageType] = useState<'success' | 'error'>('success');
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDriftSummary = useCallback(async () => {
    try {
      const summary = await getDriftSummary(teamId);
      setDriftSummary(summary);
    } catch {
      // Non-critical — drift summary is supplementary
    }
  }, [teamId]);

  useEffect(() => {
    loadConfig();
    loadDriftSummary();
  }, [loadConfig, loadDriftSummary]);

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

  // Cooldown countdown timer
  useEffect(() => {
    if (!cooldownEnd) {
      setCooldownSeconds(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, cooldownEnd - Date.now());
      const secs = Math.ceil(remaining / 1000);
      setCooldownSeconds(secs);
      if (remaining <= 0) {
        setCooldownEnd(null);
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [cooldownEnd]);

  const isCoolingDown = cooldownSeconds > 0;

  const handleSync = async () => {
    setSyncMessage(null);
    setSyncMessageType('success');
    const result = await triggerSync();
    if (result) {
      try {
        const summary: ManifestSyncSummary = result.summary;
        setSyncMessage(formatSyncSummary(summary));
      } catch {
        setSyncMessage('Sync completed');
      }
      // Refresh drift summary after sync
      loadDriftSummary();
    }
    // On failure, hookError is set by the hook (e.g. "Please wait before syncing again")
    // and rendered directly — no need to duplicate the message in syncMessage
    setCooldownEnd(Date.now() + SYNC_COOLDOWN_MS);
  };

  const handleDismissBanner = () => {
    setSyncMessage(null);
    clearSyncResult();
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  };

  if (isLoading) {
    return (
      <div className={teamStyles.section}>
        <div className={teamStyles.sectionHeader}>
          <h2 className={teamStyles.sectionTitle}>Manifest Sync</h2>
        </div>
        <div className={teamStyles.loading} style={{ padding: '2rem' }}>
          <div className={teamStyles.spinner} />
          <span>Loading manifest config...</span>
        </div>
      </div>
    );
  }

  // No manifest configured
  if (!config) {
    return (
      <div className={teamStyles.section}>
        <div className={teamStyles.sectionHeader}>
          <h2 className={teamStyles.sectionTitle}>Manifest Sync</h2>
        </div>
        <div className={teamStyles.noItems}>
          <p>No manifest URL configured.</p>
          {canManage && (
            <Link to={`/teams/${teamId}/manifest`} className={styles.manageLink}>
              Configure Manifest →
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Parse last sync summary if available
  let lastSyncSummary: ManifestSyncSummary | null = null;
  if (config.last_sync_summary) {
    try {
      lastSyncSummary = JSON.parse(config.last_sync_summary);
    } catch {
      // Ignore parse errors
    }
  }

  const serviceCount = lastSyncSummary
    ? lastSyncSummary.services.created +
      lastSyncSummary.services.updated +
      lastSyncSummary.services.unchanged +
      lastSyncSummary.services.drift_flagged
    : null;

  const isDisabled = !config.is_enabled;
  const hasError = config.last_sync_status === 'failed';
  const hasDrift = driftSummary && driftSummary.pending_count > 0;

  return (
    <div className={teamStyles.section}>
      <div className={teamStyles.sectionHeader}>
        <h2 className={teamStyles.sectionTitle}>Manifest Sync</h2>
      </div>

      <div className={styles.cardBody}>
        {/* Manifest URL */}
        <div className={styles.manifestUrl} title={config.manifest_url}>
          {truncateUrl(config.manifest_url)}
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

        {/* Disabled state */}
        {isDisabled && (
          <div className={styles.disabledMessage}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="8" cy="8" r="7" />
              <path d="M8 5v3M8 11h.01" />
            </svg>
            Scheduled syncs are paused
          </div>
        )}

        {/* Sync status (when not disabled) */}
        {!isDisabled && config.last_sync_at && (
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
            <span>
              {hasError ? 'Last sync failed' : `Last sync ${config.last_sync_status || 'success'}`}
            </span>
            <span className={styles.syncTime}>{formatTimeAgo(config.last_sync_at)}</span>
            {serviceCount !== null && !hasError && (
              <span className={styles.syncTime}>
                · {serviceCount} {serviceCount === 1 ? 'service' : 'services'}
              </span>
            )}
          </div>
        )}

        {/* Sync error detail */}
        {hasError && config.last_sync_error && (
          <div className={styles.syncError}>{config.last_sync_error}</div>
        )}

        {/* Drift alert */}
        {hasDrift && (
          <Link to={`/teams/${teamId}/manifest`} className={styles.driftAlert}>
            <svg className={styles.driftAlertIcon} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 1L1 14h14L8 1zM8 6v4M8 12h.01" />
            </svg>
            <span>
              {driftSummary.pending_count} pending drift{' '}
              {driftSummary.pending_count === 1 ? 'flag' : 'flags'}
              {driftSummary.dismissed_count > 0 && ` (${driftSummary.dismissed_count} dismissed)`}
            </span>
          </Link>
        )}

        {/* Hook error (e.g. 429 cooldown message) */}
        {hookError && (
          <div className={`${styles.syncResultBanner} ${styles.syncResultError}`}>
            <span>{hookError}</span>
          </div>
        )}

        {/* Actions */}
        <div className={styles.cardActions}>
          {!isDisabled && canManage && (
            <div className={styles.syncButtonGroup}>
              <button
                onClick={handleSync}
                disabled={isSyncing || isCoolingDown}
                className={styles.syncButton}
              >
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
              {isCoolingDown && !isSyncing && (
                <span className={styles.cooldownText}>
                  Available in {cooldownSeconds}s
                </span>
              )}
            </div>
          )}
          <Link to={`/teams/${teamId}/manifest`} className={styles.manageLink}>
            Manage Manifest →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ManifestStatusCard;
