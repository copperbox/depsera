import { useState, useEffect, useCallback } from 'react';
import { fetchServices } from '../../../api/services';
import { formatRelativeTime } from '../../../utils/formatting';
import { usePolling, INTERVAL_OPTIONS } from '../../../hooks/usePolling';
import { ServiceDetailPanel } from './ServiceDetailPanel';
import type { Service, HealthStatus } from '../../../types/service';
import styles from './Wallboard.module.css';

const FILTER_KEY = 'wallboard-filter-unhealthy';
const HIDE_NO_DEPENDENTS_KEY = 'wallboard-hide-no-dependents';

function getCardClass(status: HealthStatus): string {
  switch (status) {
    case 'healthy':
      return styles.cardHealthy;
    case 'warning':
      return styles.cardWarning;
    case 'critical':
      return styles.cardCritical;
    default:
      return styles.cardUnknown;
  }
}

function getStatusClass(status: HealthStatus): string {
  switch (status) {
    case 'healthy':
      return styles.statusHealthy;
    case 'warning':
      return styles.statusWarning;
    case 'critical':
      return styles.statusCritical;
    default:
      return styles.statusUnknown;
  }
}

function Wallboard() {
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [showUnhealthyOnly, setShowUnhealthyOnly] = useState(() => {
    return localStorage.getItem(FILTER_KEY) === 'true';
  });
  const [hideNoDependents, setHideNoDependents] = useState(() => {
    const stored = localStorage.getItem(HIDE_NO_DEPENDENTS_KEY);
    return stored === null ? true : stored === 'true';
  });

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await fetchServices();
      setServices(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load services');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { isPollingEnabled, pollingInterval, togglePolling, handleIntervalChange } = usePolling({
    storageKey: 'wallboard',
    onPoll: useCallback(() => loadData(true), [loadData]),
  });

  const handleFilterChange = () => {
    const newValue = !showUnhealthyOnly;
    setShowUnhealthyOnly(newValue);
    localStorage.setItem(FILTER_KEY, String(newValue));
  };

  const handleHideNoDependentsChange = () => {
    const newValue = !hideNoDependents;
    setHideNoDependents(newValue);
    localStorage.setItem(HIDE_NO_DEPENDENTS_KEY, String(newValue));
  };

  const handleCardClick = (serviceId: string) => {
    setSelectedServiceId((prev) => (prev === serviceId ? null : serviceId));
  };

  const filtered = services.filter((s) => {
    if (showUnhealthyOnly && s.health.status !== 'warning' && s.health.status !== 'critical') {
      return false;
    }
    if (hideNoDependents && s.health.dependent_count === 0) {
      return false;
    }
    return true;
  });

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading wallboard...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>Error: {error}</p>
          <button onClick={() => loadData()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Wallboard</h2>
          <div className={styles.controls}>
            <label className={styles.filterToggle}>
              <input
                type="checkbox"
                checked={hideNoDependents}
                onChange={handleHideNoDependentsChange}
              />
              Hide no dependents
            </label>
            <label className={styles.filterToggle}>
              <input
                type="checkbox"
                checked={showUnhealthyOnly}
                onChange={handleFilterChange}
              />
              Unhealthy only
            </label>
            <div className={styles.pollingControls}>
              <button
                className={`${styles.pollingButton} ${isPollingEnabled ? styles.pollingButtonActive : ''}`}
                onClick={togglePolling}
              >
                {isPollingEnabled ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
              </button>
              {isPollingEnabled && (
                <select
                  className={styles.intervalSelect}
                  value={pollingInterval}
                  onChange={handleIntervalChange}
                >
                  {INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            {showUnhealthyOnly
              ? 'All services are healthy!'
              : hideNoDependents
                ? 'No services with dependents found.'
                : 'No services found.'}
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((service) => (
              <div
                key={service.id}
                className={`${styles.card} ${getCardClass(service.health.status)} ${selectedServiceId === service.id ? styles.cardSelected : ''}`}
                onClick={() => handleCardClick(service.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardClick(service.id);
                  }
                }}
              >
                <span className={styles.cardName}>{service.name}</span>
                <div className={styles.cardMeta}>
                  <div className={styles.cardMetaRow}>
                    <span>Status</span>
                    <span className={`${styles.statusBadge} ${getStatusClass(service.health.status)}`}>
                      {service.health.status}
                    </span>
                  </div>
                  <div className={styles.cardMetaRow}>
                    <span>Dependents</span>
                    <span>{service.health.dependent_count}</span>
                  </div>
                  <div className={styles.cardMetaRow}>
                    <span>Last report</span>
                    <span>
                      {service.health.last_report
                        ? formatRelativeTime(service.health.last_report)
                        : 'Never'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedServiceId && (
        <ServiceDetailPanel
          serviceId={selectedServiceId}
          onClose={() => setSelectedServiceId(null)}
        />
      )}
    </div>
  );
}

export default Wallboard;
