import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronRight, Copy, Check, Loader2 } from 'lucide-react';
import { fetchServiceCatalog, fetchTeams } from '../../../api/services';
import type { CatalogEntry, TeamWithCounts } from '../../../types/service';
import ExternalDependencies from './ExternalDependencies';
import styles from './ServiceCatalog.module.css';

type CatalogTab = 'services' | 'external';

interface TeamGroup {
  teamName: string;
  teamKey: string | null;
  teamId: string;
  entries: CatalogEntry[];
}

function ServiceCatalog() {
  const [activeTab, setActiveTab] = useState<CatalogTab>('services');
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());

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
          (e.manifest_key && e.manifest_key.toLowerCase().includes(term)) ||
          (e.team_key && e.team_key.toLowerCase().includes(term)),
      );
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, searchQuery, teamFilter]);

  const teamGroups = useMemo(() => {
    const groupMap = new Map<string, TeamGroup>();

    for (const entry of filteredEntries) {
      let group = groupMap.get(entry.team_id);
      if (!group) {
        group = {
          teamName: entry.team_name,
          teamKey: entry.team_key,
          teamId: entry.team_id,
          entries: [],
        };
        groupMap.set(entry.team_id, group);
      }
      group.entries.push(entry);
    }

    return Array.from(groupMap.values()).sort((a, b) =>
      a.teamName.localeCompare(b.teamName),
    );
  }, [filteredEntries]);

  // When searching, auto-expand all teams
  const effectiveCollapsed = useMemo(() => {
    if (searchQuery) return new Set<string>();
    return collapsedTeams;
  }, [searchQuery, collapsedTeams]);

  const toggleTeam = (teamId: string) => {
    setCollapsedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

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
      // Clipboard API not available — silently ignore
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Loader2 size={24} className={styles.spinner} />
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
        <h1 className={styles.title}>Catalog</h1>
      </div>

      <div className={styles.tabBar}>
        <button
          className={`${styles.tab} ${activeTab === 'services' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('services')}
        >
          Services
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'external' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('external')}
        >
          External Dependencies
        </button>
      </div>

      {activeTab === 'external' ? (
        <ExternalDependencies />
      ) : (
        <>
          <div className={styles.filters}>
            <div className={styles.searchWrapper}>
              <Search size={16} className={styles.searchIcon} />
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
            <div className={styles.teamSections}>
              {teamGroups.map((group) => {
                const isCollapsed = effectiveCollapsed.has(group.teamId);

                return (
                  <div key={group.teamId} className={styles.teamSection}>
                    <button
                      className={styles.teamHeader}
                      onClick={() => toggleTeam(group.teamId)}
                      aria-expanded={!isCollapsed}
                    >
                      <ChevronRight
                        size={16}
                        className={`${styles.chevron} ${!isCollapsed ? styles.chevronOpen : ''}`}
                      />
                      <span className={styles.teamName}>{group.teamName}</span>
                      {group.teamKey && (
                        <code className={styles.teamKeyBadge}>{group.teamKey}</code>
                      )}
                      <span className={styles.serviceCount}>
                        {group.entries.length} {group.entries.length === 1 ? 'service' : 'services'}
                      </span>
                    </button>

                    {!isCollapsed && (
                      <div className={styles.serviceGrid}>
                        {group.entries.map((entry) => {
                          const namespacedKey = getNamespacedKey(entry);

                          return (
                            <div key={entry.id} className={styles.serviceCard}>
                              <div className={styles.cardHeader}>
                                <span className={styles.cardName}>{entry.name}</span>
                                <span
                                  className={`${styles.statusBadge} ${entry.is_active ? styles.statusActive : styles.statusInactive}`}
                                >
                                  <span
                                    className={`${styles.statusDot} ${entry.is_active ? styles.statusDotActive : styles.statusDotInactive}`}
                                  />
                                  {entry.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </div>

                              {namespacedKey ? (
                                <div className={styles.cardKey}>
                                  <code className={styles.manifestKeyCode}>
                                    {namespacedKey}
                                  </code>
                                  <button
                                    className={`${styles.copyButton} ${copiedId === entry.id ? styles.copyButtonCopied : ''}`}
                                    onClick={() => handleCopy(namespacedKey, entry.id)}
                                    title="Copy manifest key"
                                    aria-label={`Copy ${namespacedKey}`}
                                  >
                                    {copiedId === entry.id ? (
                                      <Check size={14} />
                                    ) : (
                                      <Copy size={14} />
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <div className={styles.cardKey}>
                                  <span className={styles.noKey}>No key</span>
                                </div>
                              )}

                              <div className={styles.cardDescription}>
                                {entry.description || 'No description'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ServiceCatalog;
