import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchServices } from '../../../api/services';
import { formatRelativeTime } from '../../../utils/formatting';
import { usePolling, INTERVAL_OPTIONS } from '../../../hooks/usePolling';
import { ServiceDetailPanel } from './ServiceDetailPanel';
import type { ServiceWithDependencies, HealthStatus } from '../../../types/service';
import styles from './Wallboard.module.css';

const FILTER_KEY = 'wallboard-filter-unhealthy';
const TEAM_FILTER_KEY = 'wallboard-filter-team';

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

function computeLatencySummary(
  reports: ServiceWithDependencies['dependent_reports']
): { min: number; avg: number; max: number } | null {
  const values = reports.map((r) => r.latency_ms).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return { min, avg, max };
}

function Wallboard() {
  const [services, setServices] = useState<ServiceWithDependencies[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [showUnhealthyOnly, setShowUnhealthyOnly] = useState(() => {
    return localStorage.getItem(FILTER_KEY) === 'true';
  });
  const [selectedTeamId, setSelectedTeamId] = useState(() => {
    return localStorage.getItem(TEAM_FILTER_KEY) || '';
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

  const teams = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of services) {
      if (s.team && !map.has(s.team.id)) {
        map.set(s.team.id, s.team.name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [services]);

  const handleFilterChange = () => {
    const newValue = !showUnhealthyOnly;
    setShowUnhealthyOnly(newValue);
    localStorage.setItem(FILTER_KEY, String(newValue));
  };

  const handleTeamFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedTeamId(value);
    if (value) {
      localStorage.setItem(TEAM_FILTER_KEY, value);
    } else {
      localStorage.removeItem(TEAM_FILTER_KEY);
    }
  };

  const handleCardClick = (serviceId: string) => {
    setSelectedServiceId((prev) => (prev === serviceId ? null : serviceId));
  };

  const filtered = useMemo(() => {
    let result = services;
    if (selectedTeamId) {
      result = result.filter((s) => s.team.id === selectedTeamId);
    }
    if (showUnhealthyOnly) {
      result = result.filter((s) => s.health.status === 'warning' || s.health.status === 'critical');
    }
    return result;
  }, [services, selectedTeamId, showUnhealthyOnly]);

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
            <select
              className={styles.teamSelect}
              value={selectedTeamId}
              onChange={handleTeamFilterChange}
              aria-label="Filter by team"
            >
              <option value="">All teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
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
              : 'No services found.'}
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((service) => {
              const latency = computeLatencySummary(service.dependent_reports);
              const isCritical = service.health.status === 'critical';
              const downDeps = isCritical
                ? service.dependencies.filter((d) => d.healthy === 0 && d.impact !== null)
                : [];

              return (
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
                  {service.last_poll_success === 0 && (
                    <div className={styles.pollFailure}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="8" cy="8" r="6" />
                        <path d="M8 5v3M8 10v1" />
                      </svg>
                      Poll failed{service.last_poll_error ? `: ${service.last_poll_error}` : ''}
                    </div>
                  )}
                  <div className={styles.cardMeta}>
                    <div className={styles.cardMetaRow}>
                      <span>Status</span>
                      <span className={`${styles.statusBadge} ${getStatusClass(service.health.status)}`}>
                        {service.health.status}
                      </span>
                    </div>
                    <div className={styles.cardMetaRow}>
                      <span>Team</span>
                      <span>{service.team.name}</span>
                    </div>
                    {latency && (
                      <div className={styles.cardMetaRow}>
                        <span>Latency</span>
                        <span>{latency.min} / {latency.avg} / {latency.max} ms</span>
                      </div>
                    )}
                    <div className={styles.cardMetaRow}>
                      <span>Last report</span>
                      <span>
                        {service.health.last_report
                          ? formatRelativeTime(service.health.last_report)
                          : 'Never'}
                      </span>
                    </div>
                  </div>
                  {downDeps.length > 0 && (
                    <div className={styles.impactRow}>
                      <span className={styles.impactLabel}>Impact</span>
                      <ul className={styles.impactList}>
                        {downDeps.map((dep) => (
                          <li key={dep.id}>
                            <span className={styles.impactDepName}>{dep.name}</span>
                            {dep.impact}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
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
