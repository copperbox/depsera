import { useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StatusBadge from '../../common/StatusBadge';
import { formatRelativeTime } from '../../../utils/formatting';
import { getHealthBadgeStatus } from '../../../utils/statusMapping';
import { usePolling, INTERVAL_OPTIONS } from '../../../hooks/usePolling';
import { useDashboard } from '../../../hooks/useDashboard';
import styles from './Dashboard.module.css';

function Dashboard() {
  const navigate = useNavigate();

  const {
    teams,
    isLoading,
    isRefreshing,
    error,
    stats,
    servicesWithIssues,
    servicesWithPollingIssues,
    recentActivity,
    unstableDependencies,
    teamHealthSummary,
    loadData,
  } = useDashboard();

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Polling hook
  const { isPollingEnabled, pollingInterval, togglePolling, handleIntervalChange } = usePolling({
    storageKey: 'dashboard',
    onPoll: useCallback(() => loadData(true), [loadData]),
  });

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Dashboard</h1>
          </div>
        </div>
        <div className={styles.skeletonDashboard}>
          <div className={styles.skeletonSummaryGrid}>
            <div className={styles.skeletonSummaryCard} />
            <div className={styles.skeletonSummaryCard} />
            <div className={styles.skeletonSummaryCard} />
            <div className={styles.skeletonSummaryCard} />
          </div>
          <div className={styles.skeletonHealthBar} />
          <div className={styles.skeletonSection} style={{ gridArea: 'issues' }} />
          <div className={styles.skeletonSection} style={{ gridArea: 'activity' }} />
          <div className={styles.skeletonSection} style={{ gridArea: 'teams' }} />
          <div className={styles.skeletonSection} style={{ gridArea: 'unstable' }} />
          <div className={styles.skeletonSection} style={{ gridArea: 'polling' }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={() => loadData(false)} className={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Dashboard</h1>
          {isRefreshing && (
            <div className={styles.refreshingIndicator}>
              <div className={styles.spinnerSmall} />
            </div>
          )}
        </div>
        <div className={styles.headerActions}>
          <div className={styles.autoRefreshControls}>
            <span className={styles.autoRefreshLabel}>Auto-refresh</span>
            <button
              role="switch"
              aria-checked={isPollingEnabled}
              onClick={togglePolling}
              className={`${styles.togglePill} ${isPollingEnabled ? styles.toggleActive : ''}`}
            >
              <span className={styles.toggleKnob} />
            </button>
            <select
              value={pollingInterval}
              onChange={handleIntervalChange}
              className={styles.intervalSelect}
              disabled={!isPollingEnabled}
              aria-label="Refresh interval"
            >
              {INTERVAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Dashboard Grid */}
      <div className={`${styles.dashboard} ${isRefreshing ? styles.refreshing : ''}`}>
        {/* Summary Cards */}
        <div className={`${styles.areaSummary} ${styles.summaryGrid}`}>
          <div
            className={styles.summaryCardTotal}
            onClick={() => navigate('/services')}
          >
            <span className={styles.cardLabel}>Total Services</span>
            <span className={styles.cardValue}>{stats.total}</span>
            <span className={styles.cardSubtext}>{teams.length} teams</span>
          </div>
          <div className={styles.summaryCardHealthy}>
            <span className={styles.cardLabel}>Healthy</span>
            <span className={styles.cardValue}>{stats.healthy}</span>
            <span className={styles.cardSubtext}>
              {stats.total > 0 ? Math.round((stats.healthy / stats.total) * 100) : 0}% of services
            </span>
          </div>
          <div className={styles.summaryCardWarning}>
            <span className={styles.cardLabel}>Warning</span>
            <span className={styles.cardValue}>{stats.warning}</span>
            <span className={styles.cardSubtext}>need attention</span>
          </div>
          <div className={styles.summaryCardCritical}>
            <span className={styles.cardLabel}>Critical</span>
            <span className={styles.cardValue}>{stats.critical}</span>
            <span className={styles.cardSubtext}>require action</span>
          </div>
        </div>

        {/* Health Overview Bar */}
        <div className={`${styles.areaHealth} ${styles.healthOverview}`}>
          <div className={styles.healthOverviewHeader}>
            <h2 className={styles.healthOverviewTitle}>Health Overview</h2>
            <span className={styles.healthOverviewSubtitle}>
              {stats.total > 0 ? Math.round((stats.healthy / stats.total) * 100) : 0}% healthy
            </span>
          </div>
          {stats.total > 0 ? (
            <>
              <div className={styles.healthBar} role="img" aria-label="Health distribution bar">
                {stats.healthy > 0 && (
                  <div
                    className={`${styles.healthSegment} ${styles.segmentHealthy}`}
                    style={{ width: `${(stats.healthy / stats.total) * 100}%` }}
                    title={`${stats.healthy} healthy (${Math.round((stats.healthy / stats.total) * 100)}%)`}
                  />
                )}
                {stats.warning > 0 && (
                  <div
                    className={`${styles.healthSegment} ${styles.segmentWarning}`}
                    style={{ width: `${(stats.warning / stats.total) * 100}%` }}
                    title={`${stats.warning} warning (${Math.round((stats.warning / stats.total) * 100)}%)`}
                  />
                )}
                {stats.critical > 0 && (
                  <div
                    className={`${styles.healthSegment} ${styles.segmentCritical}`}
                    style={{ width: `${(stats.critical / stats.total) * 100}%` }}
                    title={`${stats.critical} critical (${Math.round((stats.critical / stats.total) * 100)}%)`}
                  />
                )}
                {stats.total - stats.healthy - stats.warning - stats.critical > 0 && (
                  <div
                    className={`${styles.healthSegment} ${styles.segmentUnknown}`}
                    style={{ width: `${((stats.total - stats.healthy - stats.warning - stats.critical) / stats.total) * 100}%` }}
                    title={`${stats.total - stats.healthy - stats.warning - stats.critical} unknown`}
                  />
                )}
              </div>
              <div className={styles.healthLegend}>
                <span className={styles.healthLegendItem}>
                  <span className={`${styles.healthLegendDot} ${styles.segmentHealthy}`} />
                  Healthy ({stats.healthy})
                </span>
                {stats.warning > 0 && (
                  <span className={styles.healthLegendItem}>
                    <span className={`${styles.healthLegendDot} ${styles.segmentWarning}`} />
                    Warning ({stats.warning})
                  </span>
                )}
                {stats.critical > 0 && (
                  <span className={styles.healthLegendItem}>
                    <span className={`${styles.healthLegendDot} ${styles.segmentCritical}`} />
                    Critical ({stats.critical})
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className={styles.emptySection}>No services registered</div>
          )}
        </div>

        {/* Services with Issues */}
        <div className={`${styles.areaIssues} ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Services with Issues</h2>
            <Link to="/services" className={styles.sectionLink}>
              View all
            </Link>
          </div>
          <div className={styles.sectionContent}>
            {servicesWithIssues.length > 0 ? (
              <ul className={styles.issuesList}>
                {servicesWithIssues.map(service => (
                  <li key={service.id} className={styles.issueItem}>
                    <Link to={`/services/${service.id}`} className={styles.issueLink}>
                      <StatusBadge
                        status={getHealthBadgeStatus(service.health.status)}
                        size="small"
                      />
                      <div>
                        <div className={styles.issueName}>{service.name}</div>
                        <div className={styles.issueTeam}>{service.team.name}</div>
                      </div>
                    </Link>
                    <div className={styles.issueStats}>
                      {service.health.healthy_reports}/{service.health.total_reports} healthy
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.emptySection}>
                All services are healthy
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className={`${styles.areaActivity} ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Activity</h2>
          </div>
          <div className={styles.sectionContent}>
            {recentActivity.length > 0 ? (
              <ul className={styles.activityList}>
                {recentActivity.map(event => {
                  const status = event.current_healthy ? 'healthy' : 'critical';
                  const previousLabel = event.previous_healthy === null
                    ? 'new'
                    : event.previous_healthy ? 'healthy' : 'critical';
                  const currentLabel = event.current_healthy ? 'healthy' : 'critical';
                  return (
                    <li key={event.id} className={styles.activityItem}>
                      <div className={`${styles.activityDot} ${status === 'healthy' ? styles.healthy : styles.critical}`} />
                      <div className={styles.activityContent}>
                        <div className={styles.activityText}>
                          <Link to={`/services/${event.service_id}`} className={styles.activityLink}>
                            {event.service_name}
                          </Link>
                          {' '}{event.dependency_name}: {previousLabel} &rarr; {currentLabel}
                        </div>
                        <div className={styles.activityTime}>
                          {formatRelativeTime(event.recorded_at)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className={styles.emptySection}>
                No recent status changes
              </div>
            )}
          </div>
        </div>

        {/* Team Health Summary */}
        <div className={`${styles.areaTeams} ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Health by Team</h2>
            <Link to="/teams" className={styles.sectionLink}>
              View all
            </Link>
          </div>
          <div className={styles.sectionContent}>
            {teamHealthSummary.length > 0 ? (
              <ul className={styles.teamList}>
                {teamHealthSummary.map(({ team, healthy, warning, critical }) => (
                  <li key={team.id} className={styles.teamItem}>
                    <Link to={`/teams/${team.id}`} className={styles.teamLink}>
                      <div className={styles.teamName}>{team.name}</div>
                    </Link>
                    <div className={styles.teamStats}>
                      {healthy > 0 && (
                        <span className={styles.teamStat}>
                          <span className={`${styles.teamStatDot} ${styles.healthy}`} />
                          {healthy}
                        </span>
                      )}
                      {warning > 0 && (
                        <span className={styles.teamStat}>
                          <span className={`${styles.teamStatDot} ${styles.warning}`} />
                          {warning}
                        </span>
                      )}
                      {critical > 0 && (
                        <span className={styles.teamStat}>
                          <span className={`${styles.teamStatDot} ${styles.critical}`} />
                          {critical}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.emptySection}>
                No teams with services
              </div>
            )}
          </div>
        </div>

        {/* Most Unstable Dependencies */}
        <div className={`${styles.areaUnstable} ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Most Unstable (24h)</h2>
          </div>
          <div className={styles.sectionContent}>
            {unstableDependencies.length > 0 ? (
              <ul className={styles.unstableList}>
                {unstableDependencies.map(dep => {
                  const maxCount = unstableDependencies[0].change_count;
                  const barWidth = maxCount > 0 ? (dep.change_count / maxCount) * 100 : 0;
                  const healthClass = dep.current_healthy ? styles.healthy : styles.critical;
                  return (
                    <li key={dep.dependency_name} className={styles.unstableItem}>
                      <div className={styles.unstableInfo}>
                        <span className={`${styles.unstableDot} ${healthClass}`} />
                        <div className={styles.unstableText}>
                          <Link to={`/services/${dep.service_id}`} className={styles.unstableName}>
                            {dep.dependency_name}
                          </Link>
                          <span className={styles.unstableService}>{dep.service_name}</span>
                        </div>
                      </div>
                      <div className={styles.unstableBar}>
                        <div className={styles.unstableBarTrack}>
                          <div
                            className={`${styles.unstableBarFill} ${healthClass}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className={styles.unstableCount}>{dep.change_count}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className={styles.emptySection}>
                All dependencies stable
              </div>
            )}
          </div>
        </div>

        {/* Polling Issues — always rendered to prevent layout shift */}
        <div className={`${styles.areaPolling} ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Polling Issues</h2>
            {servicesWithPollingIssues.length > 0 && (
              <span className={styles.pollingIssuesBadge}>
                {servicesWithPollingIssues.length}
              </span>
            )}
          </div>
          <div className={styles.sectionContent}>
            {servicesWithPollingIssues.length > 0 ? (
              <ul className={styles.issuesList}>
                {servicesWithPollingIssues.map(svc => (
                  <li key={svc.id} className={styles.issueItem}>
                    <Link to={`/services/${svc.id}`} className={styles.issueLink}>
                      <span className={`${styles.pollingDot} ${svc.pollError ? styles.critical : styles.warning}`} />
                      <div>
                        <div className={styles.issueName}>{svc.name}</div>
                        <div className={styles.issueTeam}>{svc.teamName}</div>
                      </div>
                    </Link>
                    <div className={styles.pollingIssueDetail}>
                      {svc.pollError
                        ? 'Poll failed'
                        : `${svc.warningCount} warning${svc.warningCount !== 1 ? 's' : ''}`}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.emptySection}>
                No polling issues
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
