import { useState, useEffect } from 'react';
import { ErrorHistoryResponse } from '../../../types/graph';
import { fetchErrorHistory } from '../../../api/errors';
import { formatRelativeTime } from '../../../utils/formatting';
import styles from './ErrorHistoryPanel.module.css';

interface ErrorHistoryPanelProps {
  dependencyId: string;
  dependencyName: string;
  onBack: () => void;
}

export function ErrorHistoryPanel({ dependencyId, dependencyName, onBack }: ErrorHistoryPanelProps) {
  const [errorHistory, setErrorHistory] = useState<ErrorHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    fetchErrorHistory(dependencyId)
      .then(setErrorHistory)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load error history');
      })
      .finally(() => setIsLoading(false));
  }, [dependencyId]);

  return (
    <>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack} aria-label="Go back">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5L7 10l5 5" />
          </svg>
        </button>
        <div className={styles.headerContent}>
          <h3 className={styles.title}>Error History</h3>
          <span className={styles.subtitle}>{dependencyName}</span>
        </div>
      </div>

      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>Loading error history...</span>
          </div>
        ) : error ? (
          <div className={styles.errorState}>
            <p>{error}</p>
            <button onClick={() => {
              setIsLoading(true);
              setError(null);
              fetchErrorHistory(dependencyId)
                .then(setErrorHistory)
                .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
                .finally(() => setIsLoading(false));
            }} className={styles.retryButton}>
              Retry
            </button>
          </div>
        ) : errorHistory ? (
          <>
            <div className={styles.summary}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryValue}>{errorHistory.errorCount}</span>
                <span className={styles.summaryLabel}>Total Events (24h)</span>
              </div>
            </div>

            {errorHistory.errors.length === 0 ? (
              <div className={styles.emptyState}>
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="24" cy="24" r="20" />
                  <path d="M16 24l6 6 12-12" />
                </svg>
                <p>No errors in the last 24 hours</p>
              </div>
            ) : (
              <div className={styles.timeline}>
                {errorHistory.errors.map((entry, index) => (
                  <div
                    key={index}
                    className={`${styles.timelineItem} ${entry.isRecovery ? styles.recovery : styles.error}`}
                  >
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineHeader}>
                        <span className={styles.timelineTime}>
                          {formatRelativeTime(entry.recordedAt)}
                        </span>
                        <span className={`${styles.timelineStatus} ${entry.isRecovery ? styles.recoveryStatus : styles.errorStatus}`}>
                          {entry.isRecovery ? 'Recovered' : 'Error'}
                        </span>
                      </div>
                      {!entry.isRecovery && (
                        <>
                          <p className={styles.timelineMessage}>
                            {entry.errorMessage || 'Unknown error'}
                          </p>
                          {entry.error && (
                            <button
                              className={styles.detailsToggle}
                              onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
                            >
                              {expandedIndex === index ? 'Hide' : 'Show'} details
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className={expandedIndex === index ? styles.rotated : ''}
                              >
                                <path d="M3 5l3 3 3-3" />
                              </svg>
                            </button>
                          )}
                          {expandedIndex === index && entry.error && (
                            <pre className={styles.errorDetails}>
                              {typeof entry.error === 'object'
                                ? JSON.stringify(entry.error, null, 2)
                                : String(entry.error)}
                            </pre>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </>
  );
}
