import { memo } from 'react';
import { Link } from 'react-router-dom';
import { ServiceNodeData, getServiceHealthStatus, HealthStatus } from '../../../types/graph';
import styles from './NodeDetailsPanel.module.css';

interface NodeDetailsPanelProps {
  nodeId: string;
  data: ServiceNodeData;
  onClose: () => void;
}

const healthStatusLabels: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  unknown: 'Unknown',
};

function NodeDetailsPanelComponent({ nodeId, data, onClose }: NodeDetailsPanelProps) {
  const healthStatus = getServiceHealthStatus(data);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>{data.name}</h3>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close panel">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 5L5 15M5 5l10 10" />
          </svg>
        </button>
      </div>

      <div className={styles.statusSection}>
        <div className={`${styles.statusBadge} ${styles[healthStatus]}`}>
          <span className={styles.statusDot} />
          {healthStatusLabels[healthStatus]}
        </div>
      </div>

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Details</h4>
        <div className={styles.detailsGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Team</span>
            <span className={styles.detailValue}>{data.teamName}</span>
          </div>
          {data.healthEndpoint && (
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Health Endpoint</span>
              <a
                href={data.healthEndpoint}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.detailLink}
              >
                {data.healthEndpoint}
              </a>
            </div>
          )}
        </div>
      </div>

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Dependencies</h4>
        <div className={styles.statsGrid}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{data.dependencyCount}</span>
            <span className={styles.statLabel}>Total</span>
          </div>
          <div className={`${styles.statItem} ${styles.healthy}`}>
            <span className={styles.statValue}>{data.healthyCount}</span>
            <span className={styles.statLabel}>Healthy</span>
          </div>
          <div className={`${styles.statItem} ${styles.critical}`}>
            <span className={styles.statValue}>{data.unhealthyCount}</span>
            <span className={styles.statLabel}>Unhealthy</span>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Link to={`/services/${nodeId}`} className={styles.viewDetailsButton}>
          View Full Details
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 12l4-4-4-4" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

export const NodeDetailsPanel = memo(NodeDetailsPanelComponent);
