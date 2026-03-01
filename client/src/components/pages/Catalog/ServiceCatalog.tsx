import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchServiceCatalog, fetchTeams } from '../../../api/services';
import type { CatalogEntry, TeamWithCounts } from '../../../types/service';
import styles from './ServiceCatalog.module.css';

type SortColumn = 'name' | 'manifest_key' | 'team_name' | 'description' | 'is_active';
type SortDirection = 'asc' | 'desc';

function ServiceCatalog() {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [catalogData, teamsData] = await Promise.all([
        fetchServiceCatalog(),
        fetchTeams(),
      ]);
      setEntries(catalogData);
      setTeams(teamsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const filteredEntries = useMemo(() => {
    let result = entries;

    if (teamFilter) {
      result = result.filter((e) => e.team_id === teamFilter);
    }

    if (searchQuery) {
      const term = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(term) ||
          (e.manifest_key && e.manifest_key.toLowerCase().includes(term)),
      );
    }

    const sorted = [...result].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;

      if (sortColumn === 'is_active') {
        return (a.is_active - b.is_active) * dir;
      }

      const aVal = (a[sortColumn] ?? '').toLowerCase();
      const bVal = (b[sortColumn] ?? '').toLowerCase();
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });

    return sorted;
  }, [entries, searchQuery, teamFilter, sortColumn, sortDirection]);

  const handleCopy = async (key: string, id: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API not available — silently ignore
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading service catalog...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={loadData} className={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Service Catalog</h1>
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
            placeholder="Search by name or manifest key..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        {teams.length > 1 && (
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
        )}
      </div>

      {filteredEntries.length === 0 ? (
        <div className={styles.emptyState}>
          {entries.length === 0 ? (
            <p>No services have been registered yet.</p>
          ) : (
            <p>No services match your search criteria.</p>
          )}
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                {([
                  ['name', 'Name'],
                  ['manifest_key', 'Manifest Key'],
                  ['team_name', 'Team'],
                  ['description', 'Description'],
                  ['is_active', 'Status'],
                ] as const).map(([col, label]) => (
                  <th
                    key={col}
                    className={styles.sortableHeader}
                    onClick={() => handleSort(col)}
                    aria-sort={sortColumn === col ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <span className={styles.headerContent}>
                      {label}
                      <span className={`${styles.sortIndicator} ${sortColumn === col ? styles.sortActive : ''}`}>
                        {sortColumn === col ? (
                          sortDirection === 'asc' ? '\u2191' : '\u2193'
                        ) : '\u2195'}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.name}</td>
                  <td>
                    {entry.manifest_key ? (
                      <span className={styles.manifestKey}>
                        <code className={styles.manifestKeyCode}>
                          {entry.manifest_key}
                        </code>
                        <button
                          className={`${styles.copyButton} ${copiedId === entry.id ? styles.copyButtonCopied : ''}`}
                          onClick={() => handleCopy(entry.manifest_key!, entry.id)}
                          title="Copy manifest key"
                          aria-label={`Copy ${entry.manifest_key}`}
                        >
                          {copiedId === entry.id ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          )}
                        </button>
                      </span>
                    ) : (
                      <span className={styles.noKey}>No key</span>
                    )}
                  </td>
                  <td className={styles.teamCell}>{entry.team_name}</td>
                  <td className={styles.descriptionCell} title={entry.description ?? undefined}>
                    {entry.description || '-'}
                  </td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${entry.is_active ? styles.statusActive : styles.statusInactive}`}
                    >
                      <span
                        className={`${styles.statusDot} ${entry.is_active ? styles.statusDotActive : styles.statusDotInactive}`}
                      />
                      {entry.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ServiceCatalog;
