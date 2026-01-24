import { useState, useEffect } from 'react';
import styles from './Home.module.css';

interface HealthStatus {
  status: string;
  timestamp: string;
  database: string;
}

function Home() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) {
          throw new Error('Failed to fetch health status');
        }
        const data = await response.json();
        setHealth(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchHealth();
  }, []);

  return (
    <div className={styles.home}>
      <h2 className={styles.heading}>Welcome to Dependencies Dashboard</h2>
      <p className={styles.description}>
        A dashboard to review and manage all tracked dependencies and services.
      </p>

      <div className={styles.statusCard}>
        <h3 className={styles.statusTitle}>API Status</h3>
        {loading && <p className={styles.loading}>Checking connection...</p>}
        {error && <p className={styles.error}>Error: {error}</p>}
        {health && (
          <div className={styles.statusInfo}>
            <p>
              <strong>Status:</strong>{' '}
              <span className={health.status === 'healthy' ? styles.healthy : styles.unhealthy}>
                {health.status}
              </span>
            </p>
            <p>
              <strong>Database:</strong> {health.database}
            </p>
            <p>
              <strong>Last checked:</strong> {new Date(health.timestamp).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Home;
