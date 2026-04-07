import { useState, useEffect, useCallback } from 'react';
import { Activity, Lock, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { getTeamOtlpStats, updateApiKeyRateLimit } from '../../../api/otlpStats';
import type { OtlpStatsResponse, OtlpApiKeyStats } from '../../../types/otlpStats';
import { ApiKeyUsageChart } from '../../Charts';
import Modal from '../../common/Modal';
import { formatRelativeTime } from '../../../utils/formatting';
import teamStyles from './Teams.module.css';
import styles from './OtlpStats.module.css';

const DEFAULT_RATE_LIMIT_RPM = 150_000;

interface OtlpStatsProps {
  teamId: string;
  canManage?: boolean;
}

function OtlpStats({ teamId, canManage = false }: OtlpStatsProps) {
  const [data, setData] = useState<OtlpStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCharts, setExpandedCharts] = useState<Set<string>>(new Set());

  // Rate limit edit dialog state
  const [editRateLimitKey, setEditRateLimitKey] = useState<OtlpApiKeyStats | null>(null);
  const [rateLimitInput, setRateLimitInput] = useState('');
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [isSavingRateLimit, setIsSavingRateLimit] = useState(false);

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

  const toggleChart = useCallback((keyId: string) => {
    setExpandedCharts(prev => {
      const next = new Set(prev);
      if (next.has(keyId)) next.delete(keyId);
      else next.add(keyId);
      return next;
    });
  }, []);

  const openRateLimitDialog = (key: OtlpApiKeyStats) => {
    setEditRateLimitKey(key);
    setRateLimitInput(key.rate_limit_is_custom ? String(key.rate_limit_rpm) : '');
    setRateLimitError(null);
  };

  const closeRateLimitDialog = () => {
    setEditRateLimitKey(null);
    setRateLimitInput('');
    setRateLimitError(null);
  };

  const validateRateLimitInput = (value: string): string | null => {
    if (value === '') return null;
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
      await loadStats();
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
      await loadStats();
    } catch (err) {
      setRateLimitError(err instanceof Error ? err.message : 'Failed to reset rate limit');
    } finally {
      setIsSavingRateLimit(false);
    }
  };

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
              <div key={k.id} className={styles.keyCard}>
                <div className={styles.keyCardHeader}>
                  <div className={styles.keyCardInfo}>
                    <span className={styles.keyName}>
                      {k.name}
                      {k.rejected_24h > 0 && (
                        <span className={styles.badgeWarning}>Approaching limit</span>
                      )}
                      {k.rejected_24h === 0 && k.rejected_7d > 0 && (
                        <span className={styles.badgeMutedWarning}>
                          {k.rejected_7d.toLocaleString()} rejected in 7d
                        </span>
                      )}
                    </span>
                    <code className={styles.keyPrefix}>{k.key_prefix}...</code>
                  </div>
                  <span className={styles.keyMeta}>
                    {k.last_used_at ? `Last used ${formatRelativeTime(k.last_used_at)}` : 'Never used'}
                  </span>
                </div>

                {/* Usage summary row */}
                <div className={styles.usageSummary}>
                  <span>
                    {k.usage_1h.toLocaleString()} pushes in last hour
                    {' \u00b7 '}{k.usage_24h.toLocaleString()} in 24h
                    {' \u00b7 '}{k.usage_7d.toLocaleString()} in 7d
                  </span>
                  {k.rejected_24h > 0 && (
                    <span className={styles.rejectedWarning}>
                      {k.rejected_24h.toLocaleString()} rejected in 24h
                    </span>
                  )}
                </div>

                {/* Rate limit display */}
                <div className={styles.rateLimitRow}>
                  <span className={styles.rateLimitText}>
                    Rate limit: {k.rate_limit_rpm === 0
                      ? 'Unlimited'
                      : `${k.rate_limit_rpm.toLocaleString()} req/min`}
                    {' '}
                    <span className={styles.rateLimitSuffix}>
                      {k.rate_limit_rpm === 0
                        ? '(admin)'
                        : k.rate_limit_is_custom ? '(custom)' : '(default)'}
                    </span>
                  </span>
                  {k.rate_limit_admin_locked && (
                    <span title="Locked by admin">
                      <Lock size={12} className={styles.lockIcon} />
                    </span>
                  )}
                  {canManage && !k.rate_limit_admin_locked && k.rate_limit_rpm !== 0 && (
                    <button
                      onClick={() => openRateLimitDialog(k)}
                      className={styles.editButton}
                      title="Edit rate limit"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => toggleChart(k.id)}
                    className={styles.expandButton}
                    title={expandedCharts.has(k.id) ? 'Hide usage graph' : 'View usage graph'}
                  >
                    {expandedCharts.has(k.id) ? (
                      <><ChevronUp size={14} /> Hide graph</>
                    ) : (
                      <><ChevronDown size={14} /> View usage</>
                    )}
                  </button>
                </div>

                {/* Expandable usage chart */}
                {expandedCharts.has(k.id) && (
                  <div className={styles.chartContainer}>
                    <ApiKeyUsageChart
                      teamId={teamId}
                      apiKeyId={k.id}
                      keyName={k.name}
                      keyPrefix={k.key_prefix}
                    />
                  </div>
                )}
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
      <Modal
        isOpen={!!editRateLimitKey}
        onClose={closeRateLimitDialog}
        title="Edit Rate Limit"
        size="sm"
      >
        {editRateLimitKey && (
          <div className={styles.rateLimitDialog}>
            <p className={styles.rateLimitDialogDesc}>
              Set the rate limit for <strong>{editRateLimitKey.name}</strong> ({editRateLimitKey.key_prefix}...).
              Leave empty to use the system default ({DEFAULT_RATE_LIMIT_RPM.toLocaleString()} req/min).
            </p>
            <label className={styles.rateLimitDialogLabel}>
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
              className={styles.rateLimitDialogInput}
              min={1}
              disabled={isSavingRateLimit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRateLimit();
              }}
            />
            {rateLimitError && (
              <p className={styles.rateLimitDialogError}>{rateLimitError}</p>
            )}
            <div className={styles.rateLimitDialogActions}>
              <button
                onClick={handleResetToDefault}
                className={styles.dialogSecondaryButton}
                disabled={isSavingRateLimit || !editRateLimitKey.rate_limit_is_custom}
              >
                Reset to default
              </button>
              <div className={styles.rateLimitDialogRight}>
                <button
                  onClick={closeRateLimitDialog}
                  className={styles.dialogSecondaryButton}
                  disabled={isSavingRateLimit}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRateLimit}
                  className={styles.dialogPrimaryButton}
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

export default OtlpStats;
