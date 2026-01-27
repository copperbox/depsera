import type { ReactNode } from 'react';
import type { ServiceTier } from '../../types';
import styles from './TierColumn.module.css';

interface TierColumnProps {
  tier: ServiceTier;
  children: ReactNode;
}

const tierLabels: Record<ServiceTier, string> = {
  frontend: 'Frontend',
  api: 'API',
  backend: 'Backend',
  database: 'Database',
};

export function TierColumn({ tier, children }: TierColumnProps) {
  return (
    <div className={styles.column} data-tier={tier}>
      <h3 className={styles.title}>{tierLabels[tier]}</h3>
      <div className={styles.services}>
        {children}
      </div>
    </div>
  );
}
