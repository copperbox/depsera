import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchServices, fetchTeams } from '../../../api/services';
import type { Service, TeamWithCounts } from '../../../types/service';
import StatusBadge, { type BadgeStatus } from '../../common/StatusBadge';
import styles from './Dashboard.module.css';

const POLLING_ENABLED_KEY = 'dashboard-auto-refresh';
const POLLING_INTERVAL_KEY = 'dashboard-refresh-interval';
const DEFAULT_INTERVAL = 30000;

const INTERVAL_OPTIONS = [
  { value: 10000, label: '10s' },
  { value: 20000, label: '20s' },
  { value: 30000, label: '30s' },
  { value: 60000, label: '1m' },
];

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function getHealthBadgeStatus(status: string): BadgeStatus {
  switch (status) {
    case 'healthy':
      return 'healthy';
    case 'warning':
      return 'warning';
    case 'critical':
      return 'critical';
    case 'no_dependents':
      return 'no_dependents';
    default:
      return 'unknown';
  }
}

interface TeamHealthSummary {
  team: TeamWithCounts;
  healthy: number;
  warning: number;
  critical: number;
  total: number;
}

function Dashboard() {
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Polling state
  const [isPollingEnabled, setIsPollingEnabled] = useState(() => {
    const stored = localStorage.getItem(POLLING_ENABLED_KEY);
    return stored === 'true';
  });
  const [pollingInterval, setPollingInterval] = useState(() => {
    const stored = localStorage.getItem(POLLING_INTERVAL_KEY);
    return stored ? parseInt(stored, 10) : DEFAULT_INTERVAL;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pollingIntervalRef = useRef<number | null>(null);

  const loadData = useCallback(async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    try {
      const [servicesData, teamsData] = await Promise.all([
        fetchServices(),
        fetchTeams(),
      ]);
      setServices(servicesData);
      setTeams(teamsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const handleRetry = () => {
    loadData(false);
  };

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Polling effect
  useEffect(() => {
    if (isPollingEnabled) {
      pollingIntervalRef.current = window.setInterval(() => {
        loadData(true);
      }, pollingInterval);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isPollingEnabled, pollingInterval, loadData]);

  // Toggle polling on/off
  const togglePolling = () => {
    const newValue = !isPollingEnabled;
    setIsPollingEnabled(newValue);
    localStorage.setItem(POLLING_ENABLED_KEY, String(newValue));
  };

  // Change polling interval
  const handleIntervalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newInterval = parseInt(e.target.value, 10);
    setPollingInterval(newInterval);
    localStorage.setItem(POLLING_INTERVAL_KEY, String(newInterval));
  };

  // Calculate summary statistics
  const stats = useMemo(() => {
    const healthyCount = services.filter(s => s.health.status === 'healthy').length;
    const warningCount = services.filter(s => s.health.status === 'warning').length;
    const criticalCount = services.filter(s => s.health.status === 'critical').length;

    return {
      total: services.length,
      healthy: healthyCount,
      warning: warningCount,
      critical: criticalCount,
    };
  }, [services]);

  // Services with issues (warning or critical)
  const servicesWithIssues = useMemo(() => {
    return services
      .filter(s => s.health.status === 'warning' || s.health.status === 'critical')
      .sort((a, b) => {
        // Sort critical first, then warning
        if (a.health.status === 'critical' && b.health.status !== 'critical') return -1;
        if (a.health.status !== 'critical' && b.health.status === 'critical') return 1;
        return 0;
      })
      .slice(0, 5);
  }, [services]);

  // Recent activity (services with recent reports, sorted by last_report)
  const recentActivity = useMemo(() => {
    return services
      .filter(s => s.health.last_report)
      .sort((a, b) => {
        const dateA = new Date(a.health.last_report!).getTime();
        const dateB = new Date(b.health.last_report!).getTime();
        return dateB - dateA;
      })
      .slice(0, 5);
  }, [services]);

  // Team health summary
  const teamHealthSummary = useMemo((): TeamHealthSummary[] => {
    return teams.map(team => {
      const teamServices = services.filter(s => s.team_id === team.id);
      return {
        team,
        healthy: teamServices.filter(s => s.health.status === 'healthy').length,
        warning: teamServices.filter(s => s.health.status === 'warning').length,
        critical: teamServices.filter(s => s.health.status === 'critical').length,
        total: teamServices.length,
      };
    }).filter(t => t.total > 0); // Only show teams with services
  }, [services, teams]);

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
          <button onClick={handleRetry} className={styles.retryButton}>
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
                {recentActivity.map(service => (
                  <li key={service.id} className={styles.activityItem}>
                    <div className={`${styles.activityIcon} ${styles[service.health.status]}`}>
                      {service.health.status === 'healthy' && (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M13 4l-7 7-3-3" />
                        </svg>
                      )}
                      {service.health.status === 'warning' && (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 1l7 14H1L8 1z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M8 6v3M8 11v1" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      )}
                      {service.health.status === 'critical' && (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="8" cy="8" r="6" />
                          <path d="M10 6l-4 4M6 6l4 4" />
                        </svg>
                      )}
                      {(service.health.status === 'unknown' || service.health.status === 'no_dependents') && (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="8" cy="8" r="6" />
                          <path d="M8 5v3M8 10v1" />
                        </svg>
                      )}
                    </div>
                    <div className={styles.activityContent}>
                      <div className={styles.activityText}>
                        <Link to={`/services/${service.id}`} className={styles.activityLink}>
                          {service.name}
                        </Link>
                        {' '}reported {service.health.status}
                      </div>
                      <div className={styles.activityTime}>
                        {formatRelativeTime(service.health.last_report)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.emptySection}>
                No recent activity
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
