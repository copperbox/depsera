import { useState, useEffect } from 'react';
import { fetchServicePollHistory, PollHistoryResponse } from '../../../api/pollHistory';
import { formatRelativeTime } from '../../../utils/formatting';
import styles from './PollIssuesSection.module.css';

interface PollIssuesSectionProps {
  serviceId: string;
}

function PollIssuesSection({ serviceId }: PollIssuesSectionProps) {
  const [data, setData] = useState<PollHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    fetchServicePollHistory(serviceId)
      .then(setData)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load poll history');
      })
      .finally(() => setIsLoading(false));
  }, [serviceId]);

  const errorCount = data?.errorCount ?? 0;
  const hasIssues = errorCount > 0;

  return (
    <div className={styles.section}>
      <button
        className={`${styles.sectionToggle} ${isExpanded ? styles.sectionToggleExpanded : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <div className={styles.sectionLeft}>
          <h2 className={styles.sectionTitle}>Poll Issues</h2>
          {!isLoading && !error && (
            <span className={`${styles.badge} ${hasIssues ? styles.badgeError : styles.badgeNeutral}`}>
              {hasIssues
                ? `${errorCount} issue${errorCount !== 1 ? 's' : ''}`
                : 'No issues'}
            </span>
          )}
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ''}`}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {isExpanded && (
        <div className={styles.content}>
          {isLoading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <span>Loading poll history...</span>
            </div>
          ) : error ? (
            <div className={styles.errorState}>
              <p>{error}</p>
              <button
                onClick={() => {
                  setIsLoading(true);
                  setError(null);
                  fetchServicePollHistory(serviceId)
                    .then(setData)
                    .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
                    .finally(() => setIsLoading(false));
                }}
                className={styles.retryButton}
              >
                Retry
              </button>
            </div>
          ) : data && data.entries.length === 0 ? (
            <div className={styles.emptyState}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="10" cy="10" r="8" />
                <path d="M7 10l2 2 4-4" />
              </svg>
              <span>No poll issues recorded</span>
            </div>
          ) : data ? (
            <div className={styles.timeline}>
              {data.entries.map((entry, index) => (
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
                    {!entry.isRecovery && entry.error && (
                      <p className={styles.timelineMessage}>{entry.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default PollIssuesSection;
