import { useState, useEffect, useCallback } from 'react';
import { fetchAdminAlertMutes } from '../../../api/alertMutes';
import { formatRelativeTime } from '../../../utils/formatting';
import type { AlertMute } from '../../../types/alert';
import styles from './AlertMutesAdmin.module.css';

interface AdminAlertMute extends AlertMute {
  team_name?: string;
}

function AlertMutesAdmin() {
  const [mutes, setMutes] = useState<AdminAlertMute[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMutes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminAlertMutes({ limit: 100 });
      setMutes(data.mutes as AdminAlertMute[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alert mutes');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMutes();
  }, [loadMutes]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Alert Mutes</h1>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {isLoading ? (
        <p>Loading...</p>
      ) : mutes.length === 0 ? (
        <div className={styles.noMutes}>No active alert mutes across any team.</div>
      ) : (
        <table className={styles.muteTable}>
          <thead>
            <tr>
              <th>Team</th>
              <th>Type</th>
              <th>Target</th>
              <th>Reason</th>
              <th>Created By</th>
              <th>Created</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {mutes.map((mute) => (
              <tr key={mute.id}>
                <td>{mute.team_name || mute.team_id}</td>
                <td>
                  <span className={styles.muteType}>
                    {mute.dependency_id ? 'Instance' : 'Canonical'}
                  </span>
                </td>
                <td>
                  {mute.dependency_id
                    ? (mute.dependency_name || mute.dependency_id)
                    : mute.canonical_name}
                  {mute.service_name && (
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                      ({mute.service_name})
                    </span>
                  )}
                </td>
                <td>{mute.reason || '-'}</td>
                <td>{mute.created_by_name || mute.created_by}</td>
                <td>{formatRelativeTime(mute.created_at)}</td>
                <td>{mute.expires_at ? formatRelativeTime(mute.expires_at) : 'Never'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AlertMutesAdmin;
