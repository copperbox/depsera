import styles from './StatusBadge.module.css';

export type BadgeStatus = 'healthy' | 'warning' | 'critical' | 'unknown' | 'no_dependents';

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
  no_dependents: 'No Dependents',
};

function StatusBadge({ status, showLabel = true, size = 'medium' }: StatusBadgeProps) {
  return (
    <span
      className={`${styles.badge} ${styles[status]} ${styles[size]}`}
      role="status"
      aria-label={statusLabels[status]}
    >
      <span className={styles.dot} aria-hidden="true" />
      {showLabel && <span className={styles.label}>{statusLabels[status]}</span>}
    </span>
  );
}

export default StatusBadge;
