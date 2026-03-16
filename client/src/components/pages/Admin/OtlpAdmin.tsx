import { useState, useEffect, useCallback } from 'react';
import { Activity, ChevronRight } from 'lucide-react';
import { getAdminOtlpStats } from '../../../api/otlpStats';
import type { AdminOtlpStatsResponse, AdminOtlpTeamStats } from '../../../types/otlpStats';
import { formatRelativeTime } from '../../../utils/formatting';
import styles from './OtlpAdmin.module.css';

function OtlpAdmin() {
  const [data, setData] = useState<AdminOtlpStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const loadStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await getAdminOtlpStats();
      setData(result);
      setError(null);
      // Expand all teams by default
      setExpandedTeams(new Set(result.teams.map(t => t.team_id)));
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
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
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

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.headerTitle}>OTLP Push Overview</h1>
      </div>

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
          />
        ))
      )}
    </div>
  );
}

interface TeamSectionProps {
  team: AdminOtlpTeamStats;
  isExpanded: boolean;
  onToggle: () => void;
}

function TeamSection({ team, isExpanded, onToggle }: TeamSectionProps) {
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {team.apiKeys.length > 0 && (
            <div className={styles.keyList}>
              {team.apiKeys.map(k => (
                <span key={k.id} className={styles.keyChip}>
                  <span className={styles.keyChipName}>{k.name}</span>
                  <code>{k.key_prefix}...</code>
                  {k.last_used_at ? formatRelativeTime(k.last_used_at) : 'never used'}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OtlpAdmin;
