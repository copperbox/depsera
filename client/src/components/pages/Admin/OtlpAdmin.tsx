import { useState, useEffect, useCallback } from 'react';
import { Activity, ChevronRight, ChevronDown, ChevronUp, Lock, Pencil } from 'lucide-react';
import { getAdminOtlpStats, getAdminOtlpUsage, updateAdminApiKeyRateLimit } from '../../../api/otlpStats';
import type {
  AdminOtlpStatsResponse,
  AdminOtlpTeamStats,
  AdminOtlpUsageResponse,
  OtlpApiKeyStats,
} from '../../../types/otlpStats';
import { ApiKeyUsageChart } from '../../Charts';
import Modal from '../../common/Modal';
import { formatRelativeTime } from '../../../utils/formatting';
import styles from './OtlpAdmin.module.css';

const DEFAULT_RATE_LIMIT_RPM = 150_000;

function OtlpAdmin() {
  const [data, setData] = useState<AdminOtlpStatsResponse | null>(null);
  const [usageData, setUsageData] = useState<AdminOtlpUsageResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [expandedCharts, setExpandedCharts] = useState<Set<string>>(new Set());

  // Rate limit edit dialog state
  const [editRateLimitKey, setEditRateLimitKey] = useState<OtlpApiKeyStats | null>(null);
  const [rateLimitInput, setRateLimitInput] = useState('');
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [isSavingRateLimit, setIsSavingRateLimit] = useState(false);
  const [adminLockChecked, setAdminLockChecked] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const now = new Date();
      const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const to = now.toISOString();

      const [statsResult, usageResult] = await Promise.all([
        getAdminOtlpStats(),
        getAdminOtlpUsage({ from, to }),
      ]);

      setData(statsResult);
      setUsageData(usageResult);
      setError(null);
      // Expand all teams by default
      setExpandedTeams(new Set(statsResult.teams.map(t => t.team_id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load OTLP stats');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const toggleTeam = (teamId: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

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
    setAdminLockChecked(key.rate_limit_admin_locked);
    setRateLimitError(null);
  };

  const closeRateLimitDialog = () => {
    setEditRateLimitKey(null);
    setRateLimitInput('');
    setRateLimitError(null);
    setAdminLockChecked(false);
  };

  const validateRateLimitInput = (value: string): string | null => {
    if (value === '') return null; // reset to default
    const num = Number(value);
    if (num === 0) return null; // admin can set unlimited
    if (!Number.isInteger(num) || num < 0) return 'Must be a non-negative integer';
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
      await updateAdminApiKeyRateLimit(editRateLimitKey.id, {
        rate_limit_rpm: newLimit,
        admin_locked: adminLockChecked,
      });
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
      await updateAdminApiKeyRateLimit(editRateLimitKey.id, {
        rate_limit_rpm: null,
        admin_locked: adminLockChecked,
      });
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
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading OTLP stats...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={loadStats} className={styles.retryButton}>Retry</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { teams, summary } = data;

  // Derive usage overview from usageData
  const usageOverview = deriveUsageOverview(usageData, teams);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.headerTitle}>OTLP Push Overview</h1>
      </div>

      {/* Usage Overview */}
      {usageOverview && (
        <div className={styles.usageOverviewSection}>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryValue}>{usageOverview.pushes24h.toLocaleString()}</div>
              <div className={styles.summaryLabel}>Pushes (24h)</div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryValue}>{usageOverview.pushes7d.toLocaleString()}</div>
              <div className={styles.summaryLabel}>Pushes (7d)</div>
            </div>
            {usageOverview.rejected24h > 0 && (
              <div className={styles.summaryCardWarning}>
                <div className={styles.summaryValue}>{usageOverview.rejected24h.toLocaleString()}</div>
                <div className={styles.summaryLabel}>Rejected (24h)</div>
              </div>
            )}
            {usageOverview.rejected7d > 0 && (
              <div className={usageOverview.rejected24h > 0 ? styles.summaryCardError : styles.summaryCardWarning}>
                <div className={styles.summaryValue}>{usageOverview.rejected7d.toLocaleString()}</div>
                <div className={styles.summaryLabel}>Rejected (7d)</div>
              </div>
            )}
          </div>

          {usageOverview.topKeys.length > 0 && (
            <>
              <h4 className={styles.sectionTitle}>Top 5 Keys by 7-day Volume</h4>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Team</th>
                      <th>7-day Pushes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageOverview.topKeys.map(k => (
                      <tr key={k.apiKeyId}>
                        <td><code>{k.keyName}</code></td>
                        <td>{k.teamName}</td>
                        <td>{k.pushCount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Global Summary */}
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
        <div className={styles.summaryCard}>
          <div className={styles.summaryValue}>{summary.total_teams}</div>
          <div className={styles.summaryLabel}>Teams</div>
        </div>
      </div>

      {/* Per-team sections */}
      {teams.length === 0 ? (
        <div className={styles.emptyState}>
          <Activity size={32} className={styles.emptyIcon} />
          <p>No OTLP services configured across any team.</p>
        </div>
      ) : (
        teams.map(team => (
          <TeamSection
            key={team.team_id}
            team={team}
            isExpanded={expandedTeams.has(team.team_id)}
            onToggle={() => toggleTeam(team.team_id)}
            expandedCharts={expandedCharts}
            onToggleChart={toggleChart}
            onEditRateLimit={openRateLimitDialog}
          />
        ))
      )}

      {/* Admin Rate Limit Edit Dialog */}
      <Modal
        isOpen={!!editRateLimitKey}
        onClose={closeRateLimitDialog}
        title="Edit Rate Limit (Admin)"
        size="sm"
      >
        {editRateLimitKey && (
          <div className={styles.rateLimitDialog}>
            <p className={styles.rateLimitDialogDesc}>
              Set the rate limit for <strong>{editRateLimitKey.name}</strong> ({editRateLimitKey.key_prefix}...).
              Leave empty to use the system default ({DEFAULT_RATE_LIMIT_RPM.toLocaleString()} req/min).
              Enter 0 for unlimited.
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
              min={0}
              disabled={isSavingRateLimit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRateLimit();
              }}
            />
            <label className={styles.lockCheckboxLabel}>
              <input
                type="checkbox"
                checked={adminLockChecked}
                onChange={(e) => setAdminLockChecked(e.target.checked)}
                disabled={isSavingRateLimit}
              />
              Lock — prevent team from changing this limit
            </label>
            {adminLockChecked && (
              <p className={styles.lockNote}>
                Team members will see this limit but cannot change it.
              </p>
            )}
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

// --- Usage overview derivation ---

interface UsageOverview {
  pushes24h: number;
  pushes7d: number;
  rejected24h: number;
  rejected7d: number;
  topKeys: { apiKeyId: string; keyName: string; teamName: string; pushCount: number }[];
}

function deriveUsageOverview(
  usageData: AdminOtlpUsageResponse | null,
  teams: AdminOtlpTeamStats[],
): UsageOverview | null {
  if (!usageData || usageData.buckets.length === 0) return null;

  const now = Date.now();
  const cutoff24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  let pushes24h = 0;
  let pushes7d = 0;
  let rejected24h = 0;
  let rejected7d = 0;

  // Build team_id -> team_name map from stats data
  const teamNameMap = new Map<string, string>();
  for (const t of teams) {
    teamNameMap.set(t.team_id, t.team_name);
  }

  // Aggregate per key for top-5
  const keyAgg = new Map<string, { keyName: string; teamId: string; pushCount: number }>();

  for (const b of usageData.buckets) {
    pushes7d += b.push_count;
    rejected7d += b.rejected_count;

    if (b.bucket_start >= cutoff24h) {
      pushes24h += b.push_count;
      rejected24h += b.rejected_count;
    }

    const existing = keyAgg.get(b.api_key_id);
    if (existing) {
      existing.pushCount += b.push_count;
    } else {
      keyAgg.set(b.api_key_id, {
        keyName: b.key_name,
        teamId: b.team_id,
        pushCount: b.push_count,
      });
    }
  }

  const topKeys = Array.from(keyAgg.entries())
    .map(([apiKeyId, v]) => ({
      apiKeyId,
      keyName: v.keyName,
      teamName: teamNameMap.get(v.teamId) ?? v.teamId,
      pushCount: v.pushCount,
    }))
    .sort((a, b) => b.pushCount - a.pushCount)
    .slice(0, 5);

  return { pushes24h, pushes7d, rejected24h, rejected7d, topKeys };
}

// --- Key card highlight helper ---

function getKeyCardHighlight(key: OtlpApiKeyStats): string | undefined {
  if (key.rejected_24h > 0) return 'amber';
  if (key.rejected_7d > 100) return 'red';
  if (key.usage_7d > 0 && key.rejected_7d / key.usage_7d > 0.01) return 'red';
  return undefined;
}

// --- TeamSection component ---

interface TeamSectionProps {
  team: AdminOtlpTeamStats;
  isExpanded: boolean;
  onToggle: () => void;
  expandedCharts: Set<string>;
  onToggleChart: (keyId: string) => void;
  onEditRateLimit: (key: OtlpApiKeyStats) => void;
}

function TeamSection({ team, isExpanded, onToggle, expandedCharts, onToggleChart, onEditRateLimit }: TeamSectionProps) {
  const errorCount = team.services.filter(s => s.last_push_success === 0).length;
  const neverPushed = team.services.filter(s => s.last_push_success === null).length;

  return (
    <div className={styles.teamSection}>
      <div className={styles.teamHeader} onClick={onToggle}>
        <ChevronRight
          size={16}
          className={isExpanded ? styles.chevronOpen : styles.chevron}
        />
        <h3 className={styles.teamName}>{team.team_name}</h3>
        <span className={styles.teamMeta}>
          {team.services.length} service{team.services.length !== 1 ? 's' : ''}
          {errorCount > 0 && `, ${errorCount} error${errorCount !== 1 ? 's' : ''}`}
          {neverPushed > 0 && `, ${neverPushed} never pushed`}
        </span>
      </div>
      {isExpanded && (
        <div className={styles.teamBody}>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Last Push</th>
                  <th>Errors (24h)</th>
                  <th>Dependencies</th>
                </tr>
              </thead>
              <tbody>
                {team.services.map(s => (
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
                      {s.last_push_at ? formatRelativeTime(s.last_push_at) : '\u2014'}
                    </td>
                    <td>
                      {s.errors_24h > 0 ? (
                        <span className={styles.badgeError}>{s.errors_24h}</span>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td>{s.dependency_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* API Keys with usage, rate limits, and charts */}
          {team.apiKeys.length > 0 && (
            <div className={styles.keyList}>
              {team.apiKeys.map(k => {
                const highlight = getKeyCardHighlight(k);
                const cardClass = highlight === 'red'
                  ? styles.keyCardRed
                  : highlight === 'amber'
                    ? styles.keyCardAmber
                    : styles.keyCard;

                return (
                  <div key={k.id} className={cardClass}>
                    <div className={styles.keyCardHeader}>
                      <div className={styles.keyCardInfo}>
                        <span className={styles.keyName}>
                          {k.name}
                          {k.rejected_24h > 0 && (
                            <span className={styles.badgeWarning}>Rate limited</span>
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
                        <span className={styles.lockIndicator} title="Locked by admin">
                          <Lock size={12} className={styles.lockIcon} /> Admin locked
                        </span>
                      )}
                      <button
                        onClick={() => onEditRateLimit(k)}
                        className={styles.editButton}
                        title="Edit rate limit"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() => onToggleChart(k.id)}
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
                          apiKeyId={k.id}
                          keyName={k.name}
                          keyPrefix={k.key_prefix}
                          isAdmin
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OtlpAdmin;
