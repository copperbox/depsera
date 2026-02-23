import { useState, useEffect, useMemo } from 'react';
import { useSuggestions } from '../../../hooks/useSuggestions';
import { fetchServices } from '../../../api/services';
import type { ServiceWithDependencies } from '../../../types/service';
import SuggestionsInbox from './SuggestionsInbox';
import ManageAssociations from './ManageAssociations';
import AliasesManager from './AliasesManager';
import styles from './AssociationsPage.module.css';

type Tab = 'suggestions' | 'manage' | 'aliases';

function AssociationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('suggestions');
  const [services, setServices] = useState<ServiceWithDependencies[]>([]);
  const suggestions = useSuggestions();

  useEffect(() => {
    suggestions.loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          className={`${styles.tab} ${activeTab === 'suggestions' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('suggestions')}
        >
          Suggestions
          {suggestions.suggestions.length > 0 && (
            <span className={styles.badge}>{suggestions.suggestions.length}</span>
          )}
        </button>
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
      </div>

      <div className={styles.content}>
        {activeTab === 'suggestions' && (
          <SuggestionsInbox suggestions={suggestions} />
        )}

        {activeTab === 'manage' && <ManageAssociations />}

        {activeTab === 'aliases' && <AliasesManager dependencyOptions={aliasDependencyOptions} />}
      </div>
    </div>
  );
}

export default AssociationsPage;
