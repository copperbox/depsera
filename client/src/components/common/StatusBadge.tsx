import styles from './StatusBadge.module.css';

export type BadgeStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

interface StatusBadgeProps {
  status: BadgeStatus;
  showLabel?: boolean;
  size?: 'small' | 'medium';
}

const statusLabels: Record<BadgeStatus, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  unknown: 'Unknown',
};

function StatusBadge({ status, showLabel = true, size = 'medium' }: StatusBadgeProps) {
  return (
    <span
      // eslint-disable-next-line security/detect-object-injection
      className={`${styles.badge} ${styles[status]} ${styles[size]}`}
      role="status"
      // eslint-disable-next-line security/detect-object-injection
      aria-label={statusLabels[status]}
    >
      <span className={styles.dot} aria-hidden="true" />
      {/* eslint-disable-next-line security/detect-object-injection */}
      {showLabel && <span className={styles.label}>{statusLabels[status]}</span>}
    </span>
  );
}

export default StatusBadge;
