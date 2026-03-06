import { useEffect, useMemo } from 'react';
import { useTeamServiceHealth } from '../../../hooks/useTeamServiceHealth';
import type { TeamMember, TeamService } from '../../../types/team';
import cardStyles from '../../common/SummaryCards.module.css';
import styles from './Teams.module.css';

interface TeamOverviewStatsProps {
  teamId: string;
  members: TeamMember[];
  services: TeamService[];
}

function TeamOverviewStats({ teamId, members, services }: TeamOverviewStatsProps) {
  const { stats, isLoading, error, reload } = useTeamServiceHealth(teamId);

  useEffect(() => {
    reload();
  }, [reload]);

  const memberBreakdown = useMemo(() => {
    const leads = members.filter(m => m.role === 'lead').length;
    const regular = members.length - leads;
    const parts: string[] = [];
    if (leads > 0) parts.push(`${leads} lead${leads !== 1 ? 's' : ''}`);
    if (regular > 0) parts.push(`${regular} member${regular !== 1 ? 's' : ''}`);
    return parts.join(' · ') || 'no members';
  }, [members]);

  const serviceBreakdown = useMemo(() => {
    const active = services.filter(s => s.is_active).length;
    const inactive = services.length - active;
    const manifest = services.filter(s => s.manifest_managed === 1).length;
    const parts: string[] = [];
    parts.push(`${active} active`);
    if (inactive > 0) parts.push(`${inactive} inactive`);
    if (manifest > 0) parts.push(`${manifest} manifest-managed`);
    return parts.join(' · ');
  }, [services]);

  const healthPercent = stats.total > 0
    ? Math.round((stats.healthy / stats.total) * 100)
    : 0;

  return (
    <div className={styles.overviewStatsWrapper}>
      <div className={cardStyles.summaryGrid}>
        {/* Members Card */}
        <div className={cardStyles.summaryCardAccent}>
          <span className={cardStyles.cardLabel}>Members</span>
          <span className={cardStyles.cardValue}>{members.length}</span>
          <span className={cardStyles.cardSubtext}>{memberBreakdown}</span>
        </div>

        {/* Services Card */}
        <div className={cardStyles.summaryCardAccent}>
          <span className={cardStyles.cardLabel}>Services</span>
          <span className={cardStyles.cardValue}>{services.length}</span>
          <span className={cardStyles.cardSubtext}>{serviceBreakdown}</span>
        </div>

        {/* Health Card */}
        {isLoading ? (
          <div className={cardStyles.skeletonSummaryCard} />
        ) : (
          <div className={cardStyles.summaryCardHealthy}>
            <span className={cardStyles.cardLabel}>Service Health</span>
            <span className={cardStyles.cardValue}>{stats.healthy}</span>
            <span className={cardStyles.cardSubtext}>
              {stats.healthy} healthy
              {stats.warning > 0 && ` · ${stats.warning} warning`}
              {stats.critical > 0 && ` · ${stats.critical} critical`}
            </span>
          </div>
        )}

        {/* Dependencies Card */}
        {isLoading ? (
          <div className={cardStyles.skeletonSummaryCard} />
        ) : (
          <div className={cardStyles.summaryCardAccent}>
            <span className={cardStyles.cardLabel}>Dependencies</span>
            <span className={cardStyles.cardValue}>{stats.totalDependencies}</span>
            <span className={cardStyles.cardSubtext}>across {stats.total} services</span>
          </div>
        )}
      </div>

      {/* Health Bar */}
      {!isLoading && stats.total > 0 && (
        <div className={cardStyles.healthOverview}>
          <div className={cardStyles.healthOverviewHeader}>
            <h3 className={cardStyles.healthOverviewTitle}>Health Overview</h3>
            <span className={cardStyles.healthOverviewSubtitle}>
              {healthPercent}% healthy
            </span>
          </div>
          <div className={cardStyles.healthBar} role="img" aria-label="Team health distribution bar">
            {stats.healthy > 0 && (
              <div
                className={`${cardStyles.healthSegment} ${cardStyles.segmentHealthy}`}
                style={{ width: `${(stats.healthy / stats.total) * 100}%` }}
                title={`${stats.healthy} healthy (${Math.round((stats.healthy / stats.total) * 100)}%)`}
              />
            )}
            {stats.warning > 0 && (
              <div
                className={`${cardStyles.healthSegment} ${cardStyles.segmentWarning}`}
                style={{ width: `${(stats.warning / stats.total) * 100}%` }}
                title={`${stats.warning} warning (${Math.round((stats.warning / stats.total) * 100)}%)`}
              />
            )}
            {stats.critical > 0 && (
              <div
                className={`${cardStyles.healthSegment} ${cardStyles.segmentCritical}`}
                style={{ width: `${(stats.critical / stats.total) * 100}%` }}
                title={`${stats.critical} critical (${Math.round((stats.critical / stats.total) * 100)}%)`}
              />
            )}
            {stats.unknown > 0 && (
              <div
                className={`${cardStyles.healthSegment} ${cardStyles.segmentUnknown}`}
                style={{ width: `${(stats.unknown / stats.total) * 100}%` }}
                title={`${stats.unknown} unknown`}
              />
            )}
          </div>
          <div className={cardStyles.healthLegend}>
            <span className={cardStyles.healthLegendItem}>
              <span className={`${cardStyles.healthLegendDot} ${cardStyles.segmentHealthy}`} />
              Healthy ({stats.healthy})
            </span>
            {stats.warning > 0 && (
              <span className={cardStyles.healthLegendItem}>
                <span className={`${cardStyles.healthLegendDot} ${cardStyles.segmentWarning}`} />
                Warning ({stats.warning})
              </span>
            )}
            {stats.critical > 0 && (
              <span className={cardStyles.healthLegendItem}>
                <span className={`${cardStyles.healthLegendDot} ${cardStyles.segmentCritical}`} />
                Critical ({stats.critical})
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className={styles.healthError}>
          Failed to load health data
        </div>
      )}
    </div>
  );
}

export default TeamOverviewStats;
