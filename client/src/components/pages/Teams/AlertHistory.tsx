import { useEffect } from 'react';
import { useAlertHistory } from '../../../hooks/useAlertHistory';
import type { AlertChannel, AlertHistoryEntry, AlertStatus } from '../../../types/alert';
import { formatTimestamp } from '../../../utils/formatting';
import styles from './Teams.module.css';
import historyStyles from './AlertHistory.module.css';

interface AlertHistoryProps {
  teamId: string;
  channels: AlertChannel[];
}

const STATUS_LABELS: Record<AlertStatus, string> = {
  sent: 'Sent',
  failed: 'Failed',
  suppressed: 'Suppressed',
};

function parsePayload(entry: AlertHistoryEntry): {
  serviceName: string;
  dependencyName: string;
} {
  if (!entry.payload) {
    return { serviceName: '—', dependencyName: '—' };
  }
  try {
    const payload = JSON.parse(entry.payload);
    return {
      serviceName: payload.serviceName || payload.service?.name || '—',
      dependencyName: payload.dependencyName || payload.dependency?.name || '—',
    };
  } catch {
    return { serviceName: '—', dependencyName: '—' };
  }
}

function getChannelType(entry: AlertHistoryEntry, channels: AlertChannel[]): string {
  const channel = channels.find((c) => c.id === entry.alert_channel_id);
  if (!channel) return '—';
  return channel.channel_type === 'slack' ? 'Slack' : 'Webhook';
}

function formatEventType(eventType: string): string {
  return eventType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function AlertHistory({ teamId, channels }: AlertHistoryProps) {
  const {
    entries,
    isLoading,
    error,
    statusFilter,
    setStatusFilter,
    loadHistory,
    clearError,
  } = useAlertHistory(teamId);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Alert History</h2>
        <div className={historyStyles.headerActions}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AlertStatus | '')}
            className={historyStyles.filterSelect}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="suppressed">Suppressed</option>
          </select>
        </div>
      </div>

      {error && (
        <div className={styles.error} style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
          {error}
          <button onClick={clearError} className={historyStyles.dismissButton} aria-label="Dismiss error">
            &times;
          </button>
        </div>
      )}

      {isLoading ? (
        <div className={styles.loading} style={{ padding: '2rem' }}>
          <div className={styles.spinner} />
          <span>Loading alert history...</span>
        </div>
      ) : entries.length === 0 ? (
        <div className={styles.noItems}>
          <p>
            {statusFilter
              ? `No ${statusFilter} alerts found.`
              : 'No alert history yet.'}
          </p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Service</th>
                <th>Dependency</th>
                <th>Event</th>
                <th>Status</th>
                <th>Channel</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const { serviceName, dependencyName } = parsePayload(entry);
                return (
                  <tr key={entry.id}>
                    <td className={historyStyles.timestampCell}>
                      {formatTimestamp(entry.sent_at)}
                    </td>
                    <td>{serviceName}</td>
                    <td>{dependencyName}</td>
                    <td className={historyStyles.eventCell}>
                      {formatEventType(entry.event_type)}
                    </td>
                    <td>
                      <span
                        className={`${historyStyles.statusBadge} ${historyStyles[`status_${entry.status}`]}`}
                      >
                        {STATUS_LABELS[entry.status]}
                      </span>
                    </td>
                    <td>{getChannelType(entry, channels)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AlertHistory;
