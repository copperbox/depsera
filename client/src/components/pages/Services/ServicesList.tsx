import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchServices, fetchTeams } from '../../../api/services';
import type { Service, TeamWithCounts } from '../../../types/service';
import StatusBadge from '../../common/StatusBadge';
import Modal from '../../common/Modal';
import ServiceForm from './ServiceForm';
import { formatRelativeTime } from '../../../utils/formatting';
import { getHealthBadgeStatus } from '../../../utils/statusMapping';
import { usePolling, INTERVAL_OPTIONS } from '../../../hooks/usePolling';
import styles from './Services.module.css';

function ServicesList() {
  const { isAdmin } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      setError(err instanceof Error ? err.message : 'Failed to load services');
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

  // Polling hook
  const { isPollingEnabled, pollingInterval, togglePolling, handleIntervalChange } = usePolling({
    storageKey: 'services',
    onPoll: useCallback(() => loadData(true), [loadData]),
  });

  const filteredServices = useMemo(() => {
    return services.filter((service) => {
      const matchesSearch = service.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesTeam = !teamFilter || service.team_id === teamFilter;
      return matchesSearch && matchesTeam;
    });
  }, [services, searchQuery, teamFilter]);

  const handleServiceCreated = () => {
    setIsAddModalOpen(false);
    loadData();
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading services...</span>
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
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Services</h1>
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
          {isAdmin && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className={styles.addButton}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M10 5v10M5 10h10" />
              </svg>
              Add Service
            </button>
          )}
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.searchWrapper}>
          <svg
            className={styles.searchIcon}
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="M13 13l4 4" />
          </svg>
          <input
            type="text"
            placeholder="Search services..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className={styles.teamSelect}
          aria-label="Filter by team"
        >
          <option value="">All Teams</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>

      {filteredServices.length === 0 ? (
        <div className={styles.emptyState}>
          {services.length === 0 ? (
            <>
              <p>No services have been added yet.</p>
              {isAdmin && (
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className={styles.addButton}
                >
                  Add your first service
                </button>
              )}
            </>
          ) : (
            <p>No services match your search criteria.</p>
          )}
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Team</th>
                <th>Status</th>
                <th>Dependent Reports</th>
                <th>Last Report</th>
              </tr>
            </thead>
            <tbody>
              {filteredServices.map((service) => (
                <tr key={service.id}>
                  <td>
                    <Link to={`/services/${service.id}`} className={styles.serviceLink}>
                      {service.name}
                    </Link>
                  </td>
                  <td className={styles.teamCell}>{service.team.name}</td>
                  <td>
                    <StatusBadge
                      status={getHealthBadgeStatus(service.health.status)}
                      size="small"
                    />
                  </td>
                  <td className={styles.depsCell}>
                    {service.health.total_reports > 0 ? (
                      <>
                        <span className={styles.depsCount}>
                          {service.health.healthy_reports}/{service.health.total_reports}
                        </span>
                        <span className={styles.depsLabel}>healthy reports</span>
                      </>
                    ) : (
                      <span className={styles.depsLabel}>No dependents</span>
                    )}
                  </td>
                  <td className={styles.timeCell}>
                    {formatRelativeTime(service.health.last_report)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Service"
        size="medium"
      >
        <ServiceForm
          teams={teams}
          onSuccess={handleServiceCreated}
          onCancel={() => setIsAddModalOpen(false)}
        />
      </Modal>
    </div>
  );
}

export default ServicesList;
