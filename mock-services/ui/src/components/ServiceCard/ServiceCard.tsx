import type { Service } from '../../types';
import { StatusBadge } from '../StatusBadge';
import styles from './ServiceCard.module.css';

interface ServiceCardProps {
  service: Service;
  isSelected: boolean;
  onClick: () => void;
}

export function ServiceCard({ service, isSelected, onClick }: ServiceCardProps) {
  const hasFailure = !!service.failureState;
  const isHealthy = service.health.healthy && !hasFailure;
  const isCascaded = service.failureState?.isCascaded;

  let statusText = isHealthy ? 'Healthy' : 'Unhealthy';
  if (hasFailure) {
    statusText = service.failureState!.mode.replace('_', ' ');
  }

  const cardClasses = [
    styles.card,
    isHealthy ? styles.healthy : styles.unhealthy,
    isCascaded ? styles.cascaded : '',
    isSelected ? styles.selected : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses} onClick={onClick}>
      <div className={styles.name}>{service.name}</div>
      <div className={styles.status}>{statusText}</div>
      {hasFailure && (
        <StatusBadge type={isCascaded ? 'cascaded' : 'injected'} />
      )}
    </div>
  );
}
