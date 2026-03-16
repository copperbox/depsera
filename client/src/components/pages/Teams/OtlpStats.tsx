import { useState, useEffect, useCallback } from 'react';
import { Activity } from 'lucide-react';
import { getTeamOtlpStats } from '../../../api/otlpStats';
import type { OtlpStatsResponse } from '../../../types/otlpStats';
import { formatRelativeTime } from '../../../utils/formatting';
import teamStyles from './Teams.module.css';
import styles from './OtlpStats.module.css';

interface OtlpStatsProps {
  teamId: string;
}

function OtlpStats({ teamId }: OtlpStatsProps) {
  const [data, setData] = useState<OtlpStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await getTeamOtlpStats(teamId);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load OTLP stats');
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={teamStyles.loading}>
          <div className={teamStyles.spinner} />
          <span>Loading OTLP stats...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={teamStyles.error} style={{ marginBottom: '1rem', padding: '0.75rem 1rem' }}>
          <p>{error}</p>
          <button onClick={loadStats} className={teamStyles.retryButton}>Retry</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { services, apiKeys, summary } = data;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>OTLP Push Stats</h3>
          <p className={styles.subtitle}>
            Status of services receiving data via OTLP push.
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{summary.total_otlp_services}</div>
          <div className={styles.summaryLabel}>Total OTLP Services</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{summary.active_services}</div>
          <div className={styles.summaryLabel}>Active</div>
        </div>
        <div className={summary.services_with_errors > 0 ? styles.summaryCardError : styles.summaryCard}>
          <div className={styles.summaryValue}>{summary.services_with_errors}</div>
          <div className={styles.summaryLabel}>With Errors</div>
        </div>
        <div className={summary.services_never_pushed > 0 ? styles.summaryCardWarning : styles.summaryCard}>
          <div className={styles.summaryValue}>{summary.services_never_pushed}</div>
          <div className={styles.summaryLabel}>Never Pushed</div>
        </div>
      </div>

      {/* Services Table */}
      {services.length === 0 ? (
        <div className={styles.emptyState}>
          <Activity size={24} className={styles.emptyIcon} />
          <p>No OTLP services configured for this team.</p>
        </div>
      ) : (
        <>
          <h4 className={styles.sectionTitle}>Services</h4>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Last Push</th>
                  <th>Errors (24h)</th>
                  <th>Dependencies</th>
                  <th>Warnings</th>
                </tr>
              </thead>
              <tbody>
                {services.map(s => (
                  <tr key={s.id}>
                    <td>
                      {s.name}
                      {!s.is_active && (
                        <span className={styles.badgeInactive} style={{ marginLeft: '0.5rem' }}>
                          Inactive
                        </span>
                      )}
                    </td>
                    <td>
                      {s.last_push_success === null ? (
                        <span className={styles.badgeNeutral}>Never pushed</span>
                      ) : s.last_push_success ? (
                        <span className={styles.badgeSuccess}>OK</span>
                      ) : (
                        <span className={styles.badgeError}>Error</span>
                      )}
                    </td>
                    <td>
                      {s.last_push_at ? formatRelativeTime(s.last_push_at) : '—'}
                    </td>
                    <td>
                      {s.errors_24h > 0 ? (
                        <span className={styles.badgeError}>{s.errors_24h}</span>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td>{s.dependency_count}</td>
                    <td>
                      {s.last_push_warnings && s.last_push_warnings.length > 0 ? (
                        <ul className={styles.warningsList}>
                          {s.last_push_warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* API Keys Section */}
      {apiKeys.length > 0 && (
        <>
          <h4 className={styles.sectionTitle}>API Keys</h4>
          <div className={styles.keyList}>
            {apiKeys.map(k => (
              <div key={k.id} className={styles.keyItem}>
                <span className={styles.keyName}>{k.name}</span>
                <code className={styles.keyPrefix}>{k.key_prefix}...</code>
                <span className={styles.keyMeta}>
                  {k.last_used_at ? `Last used ${formatRelativeTime(k.last_used_at)}` : 'Never used'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Error details */}
      {services.some(s => s.last_push_error) && (
        <>
          <h4 className={styles.sectionTitle}>Recent Errors</h4>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {services
                  .filter(s => s.last_push_error)
                  .map(s => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className={styles.errorText} title={s.last_push_error!}>
                        {s.last_push_error}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default OtlpStats;
