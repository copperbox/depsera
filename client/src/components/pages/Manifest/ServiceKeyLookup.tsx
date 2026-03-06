import { useState, useCallback, useMemo } from 'react';
import { ChevronRight, Search, Copy, Check, Loader2 } from 'lucide-react';
import { fetchServiceCatalog } from '../../../api/services';
import type { CatalogEntry } from '../../../types/service';
import styles from './ManifestPage.module.css';

function ServiceKeyLookup() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    if (loaded) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchServiceCatalog();
      setEntries(data);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog');
    } finally {
      setIsLoading(false);
    }
  }, [loaded]);

  const handleToggle = () => {
    const opening = !isExpanded;
    setIsExpanded(opening);
    if (opening) {
      loadCatalog();
    }
  };

  const filteredEntries = useMemo(() => {
    if (!searchQuery) return entries;
    const term = searchQuery.toLowerCase();
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(term) ||
        (e.manifest_key && e.manifest_key.toLowerCase().includes(term)) ||
        (e.team_key && e.team_key.toLowerCase().includes(term)),
    );
  }, [entries, searchQuery]);

  const getNamespacedKey = (entry: CatalogEntry): string | null => {
    if (!entry.manifest_key) return null;
    if (entry.team_key) return `${entry.team_key}/${entry.manifest_key}`;
    return entry.manifest_key;
  };

  const handleCopy = async (key: string, id: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <div className={styles.lookupSection}>
      <button
        className={styles.lookupToggle}
        onClick={handleToggle}
        aria-expanded={isExpanded}
      >
        <ChevronRight
          size={16}
          style={{
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform var(--duration-normal) ease',
          }}
        />
        <span>Service Key Lookup</span>
        <span className={styles.lookupHint}>
          Find manifest keys from other teams
        </span>
      </button>

      {isExpanded && (
        <div className={styles.lookupContent}>
          {isLoading && (
            <div className={styles.lookupLoading}>
              <Loader2 size={16} className={styles.spinnerSmall} />
              <span>Loading catalog...</span>
            </div>
          )}

          {error && (
            <div className={styles.lookupError}>
              {error}
              <button
                onClick={() => { setLoaded(false); loadCatalog(); }}
                className={styles.lookupRetry}
              >
                Retry
              </button>
            </div>
          )}

          {loaded && !error && (
            <>
              <div className={styles.lookupSearch}>
                <Search size={16} className={styles.lookupSearchIcon} />
                <input
                  type="text"
                  placeholder="Search services or keys..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={styles.lookupSearchInput}
                />
              </div>

              {filteredEntries.length === 0 ? (
                <div className={styles.lookupEmpty}>
                  {entries.length === 0
                    ? 'No services found in the catalog.'
                    : 'No services match your search.'}
                </div>
              ) : (
                <div className={styles.lookupTable}>
                  <table>
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th>Manifest Key</th>
                        <th>Team</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.name}</td>
                          <td>
                            {(() => {
                              const nsKey = getNamespacedKey(entry);
                              return nsKey ? (
                                <span className={styles.lookupKey}>
                                  <code>{nsKey}</code>
                                  <button
                                    className={`${styles.lookupCopy} ${copiedId === entry.id ? styles.lookupCopied : ''}`}
                                    onClick={() => handleCopy(nsKey, entry.id)}
                                    title="Copy key"
                                    aria-label={`Copy ${nsKey}`}
                                  >
                                    {copiedId === entry.id ? (
                                      <Check size={12} />
                                    ) : (
                                      <Copy size={12} />
                                    )}
                                  </button>
                                </span>
                              ) : (
                                <span className={styles.lookupNoKey}>-</span>
                              );
                            })()}
                          </td>
                          <td className={styles.lookupTeam}>{entry.team_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ServiceKeyLookup;
