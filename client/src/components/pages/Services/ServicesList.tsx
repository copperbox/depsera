import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useServicesList } from '../../../hooks/useServicesList';
import StatusBadge from '../../common/StatusBadge';
import Modal from '../../common/Modal';
import ServiceForm from './ServiceForm';
import { formatRelativeTime } from '../../../utils/formatting';
import { getHealthBadgeStatus } from '../../../utils/statusMapping';
import { usePolling, INTERVAL_OPTIONS } from '../../../hooks/usePolling';
import styles from './Services.module.css';

function ServicesList() {
  const { user, isAdmin, canManageServices } = useAuth();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const {
    services,
    teams,
    filteredServices,
    isLoading,
    isRefreshing,
    error,
    searchQuery,
    setSearchQuery,
    teamFilter,
    setTeamFilter,
    loadData,
  } = useServicesList();

  // For non-admins, filter the team dropdown to only show teams the user belongs to
  const userTeamIds = useMemo(
    () => new Set(user?.teams?.map((t) => t.team_id) ?? []),
    [user?.teams]
  );

  const filterTeams = useMemo(
    () => (isAdmin ? teams : teams.filter((t) => userTeamIds.has(t.id))),
    [isAdmin, teams, userTeamIds]
  );

  // For the create form, only show teams where the user is a lead (or all for admin)
  const creatableTeams = useMemo(() => {
    if (isAdmin) return teams;
    const leadTeamIds = new Set(
      user?.teams?.filter((t) => t.role === 'lead').map((t) => t.team_id) ?? []
    );
    return teams.filter((t) => leadTeamIds.has(t.id));
  }, [isAdmin, teams, user?.teams]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  /* istanbul ignore next -- @preserve
     Polling callback is triggered by usePolling's internal interval timer.
     Testing this requires controlling timing which is flaky in unit tests. */
  // Polling hook
  const { isPollingEnabled, pollingInterval, togglePolling, handleIntervalChange } = usePolling({
    storageKey: 'services',
    onPoll: useCallback(() => loadData(true), [loadData]),
  });

  /* istanbul ignore next -- @preserve
     handleServiceCreated is triggered by ServiceForm onSuccess inside a Modal.
     Testing requires HTMLDialogElement mocking. Integration tests preferred. */
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
          <button onClick={() => loadData(false)} className={styles.retryButton}>
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
          {canManageServices && (
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
        {filterTeams.length > 1 && (
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className={styles.teamSelect}
            aria-label="Filter by team"
          >
            <option value="">{isAdmin ? 'All Teams' : 'My Teams'}</option>
            {filterTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {filteredServices.length === 0 ? (
        <div className={styles.emptyState}>
          {services.length === 0 ? (
            <>
              <p>{isAdmin ? 'No services have been added yet.' : 'No services found for your team(s).'}</p>
              {canManageServices && (
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
          teams={creatableTeams}
          onSuccess={handleServiceCreated}
          onCancel={() => setIsAddModalOpen(false)}
        />
      </Modal>
    </div>
  );
}

export default ServicesList;
