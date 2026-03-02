import { useState, useEffect, useMemo } from 'react';
import { fetchServices } from '../../../api/services';
import type { ServiceWithDependencies } from '../../../types/service';
import ManageAssociations from './ManageAssociations';
import AliasesManager from './AliasesManager';
import ExternalServicesManager from './ExternalServicesManager';
import styles from './AssociationsPage.module.css';

type Tab = 'manage' | 'aliases' | 'external';

function AssociationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('manage');
  const [services, setServices] = useState<ServiceWithDependencies[]>([]);

  useEffect(() => {
    fetchServices().then(setServices).catch((err) => {
      console.error('Failed to fetch services:', err);
    });
  }, []);

  const aliasDependencyOptions = useMemo(
    () => services.flatMap((svc) =>
      (svc.dependencies || []).map((dep) => ({
        value: dep.name,
        label: dep.name,
        group: svc.name,
      })),
    ),
    [services],
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Associations</h1>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'manage' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('manage')}
        >
          Manage
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'aliases' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('aliases')}
        >
          Aliases
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'external' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('external')}
        >
          External Services
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === 'manage' && <ManageAssociations />}

        {activeTab === 'aliases' && <AliasesManager dependencyOptions={aliasDependencyOptions} />}

        {activeTab === 'external' && <ExternalServicesManager />}
      </div>
    </div>
  );
}

export default AssociationsPage;
