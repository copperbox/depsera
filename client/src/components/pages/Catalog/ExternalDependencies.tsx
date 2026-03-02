import { useState, useEffect, useMemo, useCallback } from 'react';
import { useExternalDependencies } from '../../../hooks/useExternalDependencies';
import styles from './ServiceCatalog.module.css';

function ExternalDependencies() {
  const { entries, isLoading, error, load } = useExternalDependencies();
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedName, setCopiedName] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery) return entries;

    const term = searchQuery.toLowerCase();
    return entries.filter(
      (e) =>
        e.canonical_name.toLowerCase().includes(term) ||
        e.aliases.some((a) => a.toLowerCase().includes(term)),
    );
  }, [entries, searchQuery]);

  const handleCopy = useCallback(async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      setCopiedName(name);
      setTimeout(() => setCopiedName(null), 2000);
    } catch {
      // Clipboard API not available — silently ignore
    }
  }, []);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <span>Loading external dependencies...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>{error}</p>
        <button onClick={load} className={styles.retryButton}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
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
            placeholder="Search by canonical name or alias..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <div className={styles.emptyState}>
          {entries.length === 0 ? (
            <p>No external dependencies found.</p>
          ) : (
            <p>No external dependencies match your search.</p>
          )}
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.depTable}>
            <thead>
              <tr>
                <th>Canonical Name</th>
                <th>Description</th>
                <th>Used By</th>
                <th>Aliases</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr key={entry.canonical_name}>
                  <td>
                    <div className={styles.canonicalCell}>
                      <code className={styles.canonicalCode}>
                        {entry.canonical_name}
                      </code>
                      <button
                        className={`${styles.copyButton} ${copiedName === entry.canonical_name ? styles.copyButtonCopied : ''}`}
                        onClick={() => handleCopy(entry.canonical_name)}
                        title="Copy canonical name"
                        aria-label={`Copy ${entry.canonical_name}`}
                      >
                        {copiedName === entry.canonical_name ? (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                  <td>
                    {entry.description ? (
                      <span>{entry.description}</span>
                    ) : (
                      <span className={styles.noDescription}>
                        No description
                      </span>
                    )}
                  </td>
                  <td>
                    <div className={styles.teamChips}>
                      {entry.teams.map((team) => (
                        <span key={team.id} className={styles.teamChip}>
                          {team.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    {entry.aliases.length > 0 ? (
                      <div className={styles.aliasBadges}>
                        {entry.aliases.map((alias) => (
                          <code key={alias} className={styles.aliasCode}>
                            {alias}
                          </code>
                        ))}
                      </div>
                    ) : (
                      <span className={styles.noDescription}>None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default ExternalDependencies;
