import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSuggestions } from '../../../hooks/useSuggestions';
import { useAssociations } from '../../../hooks/useAssociations';
import { fetchServices } from '../../../api/services';
import type { ServiceWithDependencies } from '../../../types/service';
import SuggestionsInbox from './SuggestionsInbox';
import AssociationForm from './AssociationForm';
import AssociationsList from './AssociationsList';
import AliasesManager from './AliasesManager';
import styles from './AssociationsPage.module.css';

type Tab = 'suggestions' | 'create' | 'existing' | 'aliases';

function AssociationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('suggestions');
  const [services, setServices] = useState<ServiceWithDependencies[]>([]);
  const [selectedDepId, setSelectedDepId] = useState('');
  const suggestions = useSuggestions();
  const { associations, isLoading: assocLoading, loadAssociations, removeAssociation } =
    useAssociations(selectedDepId || undefined);

  useEffect(() => {
    suggestions.loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchServices().then(setServices).catch((err) => {
      console.error('Failed to fetch services:', err);
    });
  }, []);

  useEffect(() => {
    if (selectedDepId) {
      loadAssociations();
    }
  }, [selectedDepId, loadAssociations]);

  const handleFormSuccess = useCallback(() => {
    if (selectedDepId) loadAssociations();
  }, [selectedDepId, loadAssociations]);

  const dependencyOptions = services.flatMap((svc) =>
    svc.dependencies.map((dep) => ({
      id: dep.id,
      label: `${dep.name} (${svc.name})`,
    })),
  );

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
          className={`${styles.tab} ${activeTab === 'create' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('create')}
        >
          Create
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'existing' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('existing')}
        >
          Existing
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

        {activeTab === 'create' && (
          <AssociationForm onSuccess={handleFormSuccess} />
        )}

        {activeTab === 'aliases' && <AliasesManager dependencyOptions={aliasDependencyOptions} />}

        {activeTab === 'existing' && (
          <div>
            <div className={styles.depSelector}>
              <label className={styles.depLabel} htmlFor="dep-select">
                Dependency
              </label>
              <select
                id="dep-select"
                className={styles.depSelect}
                value={selectedDepId}
                onChange={(e) => setSelectedDepId(e.target.value)}
              >
                <option value="">Select a dependency...</option>
                {dependencyOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {selectedDepId && (
              <AssociationsList
                associations={associations}
                isLoading={assocLoading}
                onDelete={removeAssociation}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AssociationsPage;
