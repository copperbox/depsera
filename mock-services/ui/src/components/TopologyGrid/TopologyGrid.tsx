import type { Service, ServiceTier } from '../../types';
import { TierColumn } from '../TierColumn';
import { ServiceCard } from '../ServiceCard';
import styles from './TopologyGrid.module.css';

interface TopologyGridProps {
  services: Service[];
  selectedServiceId: string | null;
  onSelectService: (service: Service) => void;
}

const TIER_ORDER: ServiceTier[] = ['database', 'backend', 'api', 'frontend'];

export function TopologyGrid({
  services,
  selectedServiceId,
  onSelectService,
}: TopologyGridProps) {
  const servicesByTier = TIER_ORDER.reduce((acc, tier) => {
    acc[tier] = services.filter(s => s.tier === tier);
    return acc;
  }, {} as Record<ServiceTier, Service[]>);

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>Service Topology</h2>
      <div className={styles.grid}>
        {TIER_ORDER.map(tier => (
          <TierColumn key={tier} tier={tier}>
            {servicesByTier[tier].map(service => (
              <ServiceCard
                key={service.id}
                service={service}
                isSelected={service.id === selectedServiceId}
                onClick={() => onSelectService(service)}
              />
            ))}
          </TierColumn>
        ))}
      </div>
    </section>
  );
}
