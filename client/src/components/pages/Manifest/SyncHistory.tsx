import { useState, useEffect } from 'react';
import { useSyncHistory } from '../../../hooks/useSyncHistory';
import type { ManifestSyncHistoryEntry, ManifestSyncSummary } from '../../../types/manifest';
import styles from './ManifestPage.module.css';

interface SyncHistoryProps {
  teamId: string;
}

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatEntrySummary(entry: ManifestSyncHistoryEntry): string {
  if (!entry.summary) return '';
  try {
    const summary: ManifestSyncSummary = JSON.parse(entry.summary);
    const parts: string[] = [];
    if (summary.services.created > 0) parts.push(`+${summary.services.created}`);
    if (summary.services.updated > 0) parts.push(`~${summary.services.updated}`);
    if (summary.services.deactivated > 0) parts.push(`-${summary.services.deactivated}`);
    if (summary.services.deleted > 0) parts.push(`×${summary.services.deleted}`);
    if (summary.services.drift_flagged > 0) parts.push(`⚠${summary.services.drift_flagged}`);
    if (summary.services.unchanged > 0) parts.push(`=${summary.services.unchanged}`);
    return parts.join(' ');
  } catch {
    return '';
  }
}

function HistoryEntry({ entry }: { entry: ManifestSyncHistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = entry.status === 'failed';
  const isPartial = entry.status === 'partial';

  let errors: string[] = [];
  if (entry.errors) {
    try {
      errors = JSON.parse(entry.errors);
    } catch {
      // ignore
    }
  }

  let warnings: string[] = [];
  if (entry.warnings) {
    try {
      warnings = JSON.parse(entry.warnings);
    } catch {
      // ignore
    }
  }

  const summaryText = formatEntrySummary(entry);
  const hasExpandableContent = errors.length > 0 || warnings.length > 0;

  return (
    <div className={styles.historyItem}>
      <span className={styles.historyDot}>
        <span
          className={`${styles.statusDot} ${
            hasError
              ? styles.statusDotError
              : isPartial
                ? styles.statusDotPartial
                : styles.statusDotSuccess
          }`}
        />
      </span>
      <div className={styles.historyContent}>
        <div className={styles.historyMain}>
          <span className={styles.historyTime}>{formatTimestamp(entry.created_at)}</span>
          <span className={styles.historyTrigger}>{entry.trigger_type}</span>
          {entry.triggered_by && (
            <span className={styles.historyUser}>by {entry.triggered_by}</span>
          )}
          {entry.duration_ms !== null && (
            <span className={styles.historyDuration}>{formatDuration(entry.duration_ms)}</span>
          )}
        </div>
        {summaryText && (
          <div className={styles.historySummary}>{summaryText}</div>
        )}
        {hasError && errors.length > 0 && !expanded && (
          <div className={styles.syncError} style={{ marginTop: '0.25rem', padding: '0.375rem 0.5rem' }}>
            {errors[0]}
          </div>
        )}
        {hasExpandableContent && (
          <>
            <button
              className={styles.detailsToggle}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? '▾ Hide details' : '▸ Show details'}
            </button>
            {expanded && (
              <>
                {errors.length > 0 && (
                  <div className={styles.syncError} style={{ marginTop: '0.5rem' }}>
                    {errors.map((e, i) => (
                      <div key={i}>{e}</div>
                    ))}
                  </div>
                )}
                {warnings.length > 0 && (
                  <div className={styles.warningsList} style={{ marginTop: '0.5rem' }}>
                    <strong>Warnings:</strong>
                    <ul>
                      {warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SyncHistory({ teamId }: SyncHistoryProps) {
  const { history, isLoading, hasMore, error, loadHistory, loadMore } = useSyncHistory(teamId);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  if (isLoading && history.length === 0) {
    return (
      <div className={styles.noItems}>
        <p>Loading sync history...</p>
      </div>
    );
  }

  if (error && history.length === 0) {
    return (
      <div className={styles.noItems}>
        <p>{error}</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className={styles.noItems}>
        <p>No sync history yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.historyList}>
        {history.map((entry) => (
          <HistoryEntry key={entry.id} entry={entry} />
        ))}
      </div>
      {hasMore && (
        <button
          className={styles.loadMoreButton}
          onClick={loadMore}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Load more'}
        </button>
      )}
    </>
  );
}

export default SyncHistory;
