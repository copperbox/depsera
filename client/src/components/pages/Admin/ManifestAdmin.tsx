import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchAdminManifests,
  syncAllManifests,
  type AdminManifestEntry,
  type SyncAllResultEntry,
} from '../../../api/adminManifests';
import { parseContact } from '../../../utils/dependency';
import { formatRelativeTime, formatTimestamp } from '../../../utils/formatting';
import styles from './ManifestAdmin.module.css';

function getStatusBadgeClass(status: string | null): string {
  switch (status) {
    case 'success': return styles.badgeSuccess;
    case 'failed': return styles.badgeFailed;
    case 'partial': return styles.badgePartial;
    default: return styles.badgeNever;
  }
}

function ManifestAdmin() {
  const [entries, setEntries] = useState<AdminManifestEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncAllResultEntry[] | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminManifests();
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load manifests');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(
      e => e.team_name.toLowerCase().includes(q) || (e.team_key ?? '').toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

  const handleSyncAll = async () => {
    setIsSyncing(true);
    setSyncResults(null);
    try {
      const result = await syncAllManifests();
      setSyncResults(result.results);
      // Reload data to reflect updated sync statuses
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync');
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading manifest configurations...</span>
        </div>
      </div>
    );
  }

  if (error && entries.length === 0) {
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
        <h1 className={styles.title}>Manifests</h1>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <svg
            className={styles.searchIcon}
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="7" cy="7" r="4" />
            <path d="M16 16l-3.5-3.5" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search teams..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button
          className={styles.syncAllButton}
          onClick={handleSyncAll}
          disabled={isSyncing}
        >
          {isSyncing ? 'Syncing...' : 'Sync All'}
        </button>
      </div>

      {syncResults && (
        <div className={styles.syncResults}>
          <div className={styles.syncResultsHeader}>
            <span className={styles.syncResultsTitle}>Sync Results</span>
            <button
              className={styles.dismissButton}
              onClick={() => setSyncResults(null)}
            >
              Dismiss
            </button>
          </div>
          {syncResults.map((r) => (
            <div key={r.team_id} className={styles.syncResultItem}>
              <span className={`${styles.badge} ${getStatusBadgeClass(r.status)}`}>
                {r.status}
              </span>
              <span>{r.team_name}</span>
              {r.error && <span style={{ color: 'var(--color-error)', fontSize: '0.75rem' }}>— {r.error}</span>}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className={styles.error} style={{ padding: '0.75rem 1rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {filteredEntries.length === 0 ? (
        <div className={styles.emptyState}>
          <p>{searchQuery ? 'No teams match your search.' : 'No teams found.'}</p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Team</th>
                <th>URL</th>
                <th>Enabled</th>
                <th>Last Sync</th>
                <th>Status</th>
                <th>Drifts</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => {
                const contactData = parseContact(entry.contact);
                const contactSummary = contactData
                  ? Object.entries(contactData).map(([k, v]) => `${k}: ${v}`).join(', ')
                  : null;

                return (
                  <tr key={entry.team_id}>
                    <td>
                      <Link to={`/teams/${entry.team_id}/manifest`} className={styles.teamLink}>
                        {entry.team_name}
                      </Link>
                    </td>
                    <td className={styles.urlCell} title={entry.manifest_url ?? undefined}>
                      {entry.manifest_url ?? '—'}
                    </td>
                    <td>
                      {entry.has_config ? (
                        <span className={`${styles.badge} ${entry.is_enabled ? styles.badgeEnabled : styles.badgeDisabled}`}>
                          {entry.is_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      ) : (
                        <span className={styles.badgeNone}>—</span>
                      )}
                    </td>
                    <td>
                      {entry.last_sync_at ? (
                        <span className={styles.relativeTime} title={formatTimestamp(entry.last_sync_at)}>
                          {formatRelativeTime(entry.last_sync_at)}
                        </span>
                      ) : (
                        <span className={styles.badgeNone}>Never</span>
                      )}
                    </td>
                    <td>
                      {entry.last_sync_status ? (
                        <span className={`${styles.badge} ${getStatusBadgeClass(entry.last_sync_status)}`}>
                          {entry.last_sync_status}
                        </span>
                      ) : (
                        <span className={styles.badgeNone}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`${styles.driftCount} ${entry.pending_drift_count > 0 ? styles.driftCountPositive : ''}`}>
                        {entry.pending_drift_count}
                      </span>
                    </td>
                    <td className={styles.contactCell} title={contactSummary ?? undefined}>
                      {contactSummary ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ManifestAdmin;
