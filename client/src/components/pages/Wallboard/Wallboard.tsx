import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchWallboardData } from '../../../api/wallboard';
import { formatRelativeTime } from '../../../utils/formatting';
import { usePolling, INTERVAL_OPTIONS } from '../../../hooks/usePolling';
import { DependencyDetailPanel } from './DependencyDetailPanel';
import type { HealthStatus } from '../../../types/service';
import type { WallboardDependency, WallboardResponse } from '../../../types/wallboard';
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
    case 'skipped':
      return styles.cardSkipped;
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
    case 'skipped':
      return styles.statusSkipped;
    default:
      return styles.statusUnknown;
  }
}

function Wallboard() {
  const [data, setData] = useState<WallboardResponse>({ dependencies: [], teams: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDep, setSelectedDep] = useState<WallboardDependency | null>(null);
  const [showUnhealthyOnly, setShowUnhealthyOnly] = useState(() => {
    return localStorage.getItem(FILTER_KEY) === 'true';
  });
  const [selectedTeamId, setSelectedTeamId] = useState(() => {
    return localStorage.getItem(TEAM_FILTER_KEY) || '';
  });

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const result = await fetchWallboardData();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dependencies');
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

  const handleTeamFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedTeamId(value);
    if (value) {
      localStorage.setItem(TEAM_FILTER_KEY, value);
    } else {
      localStorage.removeItem(TEAM_FILTER_KEY);
    }
  };

  const handleCardClick = (dep: WallboardDependency) => {
    setSelectedDep((prev) =>
      prev?.canonical_name === dep.canonical_name ? null : dep,
    );
  };

  const filtered = useMemo(() => {
    let result = data.dependencies;
    if (selectedTeamId) {
      result = result.filter((d) => d.team_ids.includes(selectedTeamId));
    }
    if (showUnhealthyOnly) {
      result = result.filter(
        (d) => d.health_status === 'warning' || d.health_status === 'critical',
      );
    }
    return result;
  }, [data.dependencies, selectedTeamId, showUnhealthyOnly]);

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
              {data.teams.map((team) => (
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
              ? 'All dependencies are healthy!'
              : 'No dependencies found.'}
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((dep) => (
              <div
                key={dep.canonical_name}
                className={`${styles.card} ${getCardClass(dep.health_status)} ${selectedDep?.canonical_name === dep.canonical_name ? styles.cardSelected : ''}`}
                onClick={() => handleCardClick(dep)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardClick(dep);
                  }
                }}
              >
                <span className={styles.cardName}>
                  {dep.canonical_name}
                  <span className={styles.typeBadge}>{dep.type}</span>
                </span>
                <div className={styles.cardMeta}>
                  <div className={styles.cardMetaRow}>
                    <span>Status</span>
                    <span className={`${styles.statusBadge} ${getStatusClass(dep.health_status)}`}>
                      {dep.health_status}
                    </span>
                  </div>
                  {dep.reporters.length === 1 ? (
                    <>
                      <div className={styles.cardMetaRow}>
                        <span>Reporter</span>
                        <span className={styles.reporterNames}>
                          {dep.reporters[0].service_name}
                        </span>
                      </div>
                      {dep.reporters[0].latency_ms != null && (
                        <div className={styles.cardMetaRow}>
                          <span>Latency</span>
                          <span>{Math.round(dep.reporters[0].latency_ms)} ms</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className={styles.cardMetaRow}>
                        <span>Reporters</span>
                        <span>{dep.reporters.length} services</span>
                      </div>
                      {dep.latency && (
                        <div className={styles.cardMetaRow}>
                          <span>Latency</span>
                          <span>{dep.latency.min} / {dep.latency.avg} / {dep.latency.max} ms</span>
                        </div>
                      )}
                    </>
                  )}
                  {dep.linked_service && (
                    <div className={styles.cardMetaRow}>
                      <span>Linked to</span>
                      <span className={styles.linkedServiceName}>{dep.linked_service.name}</span>
                    </div>
                  )}
                  <div className={styles.cardMetaRow}>
                    <span>Last checked</span>
                    <span>
                      {dep.last_checked
                        ? formatRelativeTime(dep.last_checked)
                        : 'Never'}
                    </span>
                  </div>
                </div>
                {dep.error_message && (
                  <div className={styles.errorRow}>
                    {dep.error_message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedDep && (
        <DependencyDetailPanel
          dependency={selectedDep}
          onClose={() => setSelectedDep(null)}
        />
      )}
    </div>
  );
}

export default Wallboard;
