import { useState, useEffect, useRef } from 'react';
import type { DriftFlagWithContext } from '../../../types/manifest';
import styles from './DriftReview.module.css';

interface DriftFlagCardProps {
  flag: DriftFlagWithContext;
  isSelected: boolean;
  canManage: boolean;
  onToggleSelect: (id: string) => void;
  onAccept: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onReopen: (id: string) => Promise<void>;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Service Name',
  health_endpoint: 'Health Endpoint',
  description: 'Description',
  metrics_endpoint: 'Metrics Endpoint',
  poll_interval_ms: 'Poll Interval',
  schema_config: 'Schema Config',
};

function formatFieldName(field: string | null): string {
  if (!field) return 'Unknown field';
  return FIELD_LABELS[field] || field;
}

function formatFieldValue(field: string | null, value: string | null): string {
  if (value === null || value === undefined) return '(empty)';
  if (field === 'poll_interval_ms') {
    const ms = parseInt(value, 10);
    if (!isNaN(ms)) {
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${ms / 1000}s`;
      return `${ms / 60000}m`;
    }
  }
  if (field === 'schema_config') {
    return 'Schema changed';
  }
  return value;
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function DriftFlagCard({
  flag,
  isSelected,
  canManage,
  onToggleSelect,
  onAccept,
  onDismiss,
  onReopen,
}: DriftFlagCardProps) {
  const [actionInProgress, setActionInProgress] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const handleAccept = async () => {
    // Service removal needs inline confirmation
    if (flag.drift_type === 'service_removal' && !confirmingRemoval) {
      setConfirmingRemoval(true);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingRemoval(false);
      }, 3000);
      return;
    }
    setConfirmingRemoval(false);
    setActionInProgress(true);
    try {
      await onAccept(flag.id);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleCancelConfirm = () => {
    setConfirmingRemoval(false);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
  };

  const handleDismiss = async () => {
    setActionInProgress(true);
    try {
      await onDismiss(flag.id);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleReopen = async () => {
    setActionInProgress(true);
    try {
      await onReopen(flag.id);
    } finally {
      setActionInProgress(false);
    }
  };

  const isDismissed = flag.status === 'dismissed';
  const isFieldChange = flag.drift_type === 'field_change';
  const isServiceRemoval = flag.drift_type === 'service_removal';

  return (
    <div className={`${styles.flagCard} ${isDismissed ? styles.flagCardDismissed : ''}`}>
      {canManage && (
        <input
          type="checkbox"
          className={styles.flagCheckbox}
          checked={isSelected}
          onChange={() => onToggleSelect(flag.id)}
          aria-label={`Select drift flag for ${flag.service_name}`}
        />
      )}

      <div className={styles.flagContent}>
        <div className={styles.flagHeader}>
          <div className={styles.flagServiceInfo}>
            <span className={styles.flagServiceName}>{flag.service_name}</span>
            {flag.manifest_key && (
              <span className={styles.flagManifestKey}>{flag.manifest_key}</span>
            )}
          </div>
          <span
            className={`${styles.driftTypeBadge} ${
              isFieldChange ? styles.badgeFieldChange : styles.badgeServiceRemoval
            }`}
          >
            {isFieldChange ? 'Field Change' : 'Service Removal'}
          </span>
        </div>

        {/* Field change diff */}
        {isFieldChange && (
          <>
            <div className={styles.fieldName}>{formatFieldName(flag.field_name)}</div>
            <div className={styles.fieldDiff}>
              <div className={styles.diffColumn}>
                <span className={styles.diffLabel}>Current</span>
                <span className={`${styles.diffValue} ${styles.diffValueCurrent}`}>
                  {formatFieldValue(flag.field_name, flag.current_value)}
                </span>
              </div>
              <div className={styles.diffColumn}>
                <span className={styles.diffLabel}>Manifest</span>
                <span className={`${styles.diffValue} ${styles.diffValueManifest}`}>
                  {formatFieldValue(flag.field_name, flag.manifest_value)}
                </span>
              </div>
            </div>
          </>
        )}

        {/* Service removal message */}
        {isServiceRemoval && (
          <div className={styles.removalMessage}>
            This service is no longer in the manifest.
          </div>
        )}

        {/* Timestamps */}
        <div className={styles.flagTimestamps}>
          Detected {formatDate(flag.first_detected_at)} · Last seen {formatTimeAgo(flag.last_detected_at)}
        </div>

        {/* Dismissed info */}
        {isDismissed && flag.resolved_by_name && (
          <div className={styles.dismissedInfo}>
            Dismissed by {flag.resolved_by_name}
            {flag.resolved_at && ` · ${formatDate(flag.resolved_at)}`}
          </div>
        )}

        {/* Inline confirmation for service removal */}
        {confirmingRemoval && (
          <div className={styles.inlineConfirm}>
            <span>Confirm deactivation?</span>
            <button className={styles.confirmYes} onClick={handleAccept}>
              Yes, deactivate
            </button>
            <button className={styles.confirmNo} onClick={handleCancelConfirm}>
              Cancel
            </button>
          </div>
        )}

        {/* Actions */}
        {canManage && !confirmingRemoval && (
          <div className={styles.flagActions}>
            {isDismissed ? (
              <>
                <button
                  className={styles.reopenButton}
                  onClick={handleReopen}
                  disabled={actionInProgress}
                >
                  Re-open
                </button>
                <button
                  className={styles.acceptButton}
                  onClick={handleAccept}
                  disabled={actionInProgress}
                >
                  {isServiceRemoval ? 'Accept (Deactivate)' : 'Accept'}
                </button>
              </>
            ) : (
              <>
                <button
                  className={styles.acceptButton}
                  onClick={handleAccept}
                  disabled={actionInProgress}
                >
                  {isServiceRemoval ? 'Accept (Deactivate)' : 'Accept'}
                </button>
                <button
                  className={styles.dismissButton}
                  onClick={handleDismiss}
                  disabled={actionInProgress}
                >
                  Dismiss
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DriftFlagCard;
