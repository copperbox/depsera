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
    recentActivity,
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
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading dashboard...</span>
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

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <div
          className={`${styles.summaryCard} ${styles.clickable}`}
          onClick={() => navigate('/services')}
        >
          <span className={styles.cardLabel}>Total Services</span>
          <span className={styles.cardValue}>{stats.total}</span>
          <span className={styles.cardSubtext}>{teams.length} teams</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.cardLabel}>Healthy</span>
          <span className={`${styles.cardValue} ${styles.healthy}`}>{stats.healthy}</span>
          <span className={styles.cardSubtext}>
            {stats.total > 0 ? Math.round((stats.healthy / stats.total) * 100) : 0}% of services
          </span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.cardLabel}>Warning</span>
          <span className={`${styles.cardValue} ${styles.warning}`}>{stats.warning}</span>
          <span className={styles.cardSubtext}>need attention</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.cardLabel}>Critical</span>
          <span className={`${styles.cardValue} ${styles.critical}`}>{stats.critical}</span>
          <span className={styles.cardSubtext}>require action</span>
        </div>
      </div>

      {/* Health Overview Bar */}
      {stats.total > 0 && (
        <div className={styles.healthOverview}>
          <div className={styles.healthOverviewHeader}>
            <h2 className={styles.healthOverviewTitle}>Health Overview</h2>
            <span className={styles.healthOverviewSubtitle}>
              {Math.round((stats.healthy / stats.total) * 100)}% healthy
            </span>
          </div>
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
        </div>
      )}

      {/* Main Content Grid */}
      <div className={styles.sectionsGrid}>
        {/* Services with Issues */}
        <div className={styles.section}>
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

        {/* Team Health Summary */}
        <div className={styles.section}>
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
                        <span className={`${styles.teamStat} ${styles.healthy}`}>
                          <span className={`${styles.teamStatDot} ${styles.healthy}`} />
                          {healthy}
                        </span>
                      )}
                      {warning > 0 && (
                        <span className={`${styles.teamStat} ${styles.warning}`}>
                          <span className={`${styles.teamStatDot} ${styles.warning}`} />
                          {warning}
                        </span>
                      )}
                      {critical > 0 && (
                        <span className={`${styles.teamStat} ${styles.critical}`}>
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

        {/* Recent Activity */}
        <div className={styles.section}>
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
                      <div className={`${styles.activityIcon} ${styles[status]}`}>
                        {event.current_healthy ? (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M13 4l-7 7-3-3" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="8" cy="8" r="6" />
                            <path d="M10 6l-4 4M6 6l4 4" />
                          </svg>
                        )}
                      </div>
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

        {/* Mini Graph Preview */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Dependency Graph</h2>
            <Link to="/graph" className={styles.sectionLink}>
              View full graph
            </Link>
          </div>
          <div
            className={styles.graphPreview}
            onClick={() => navigate('/graph')}
          >
            <div className={styles.graphPlaceholder}>
              <svg
                className={styles.graphIcon}
                width="48"
                height="48"
                viewBox="0 0 48 48"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="24" r="4" />
                <circle cx="36" cy="12" r="4" />
                <circle cx="36" cy="36" r="4" />
                <path d="M16 24h12M28 20l8-6M28 28l8 6" />
              </svg>
              <span className={styles.graphText}>
                Click to view dependency graph
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
