import styles from './StatusBadge.module.css';

type BadgeType = 'healthy' | 'unhealthy' | 'injected' | 'cascaded';

interface StatusBadgeProps {
  type: BadgeType;
  label?: string;
}

export function StatusBadge({ type, label }: StatusBadgeProps) {
  const defaultLabels: Record<BadgeType, string> = {
    healthy: 'Healthy',
    unhealthy: 'Unhealthy',
    injected: 'injected',
    cascaded: 'cascaded',
  };

  return (
    <span className={`${styles.badge} ${styles[type]}`}>
      {label || defaultLabels[type]}
    </span>
  );
}
