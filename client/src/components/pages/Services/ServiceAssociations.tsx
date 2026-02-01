import { useState, useEffect, useCallback } from 'react';
import { useAssociations } from '../../../hooks/useAssociations';
import { generateServiceSuggestions, fetchSuggestions } from '../../../api/associations';
import type { Dependency } from '../../../types/service';
import type { AssociationSuggestion } from '../../../types/association';
import { ASSOCIATION_TYPE_LABELS } from '../../../types/association';
import { acceptSuggestion, dismissSuggestion } from '../../../api/associations';
import Modal from '../../common/Modal';
import AssociationForm from '../Associations/AssociationForm';
import styles from './ServiceAssociations.module.css';

interface ServiceAssociationsProps {
  serviceId: string;
  dependencies: Dependency[];
}

function ServiceAssociations({ serviceId, dependencies }: ServiceAssociationsProps) {
  const [selectedDepId, setSelectedDepId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formDepId, setFormDepId] = useState<string>('');
  const [pendingSuggestions, setPendingSuggestions] = useState<AssociationSuggestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    associations,
    isLoading,
    loadAssociations,
    removeAssociation,
  } = useAssociations(selectedDepId || undefined);

  // Load suggestions for this service's dependencies
  const loadPendingSuggestions = useCallback(async () => {
    try {
      const all = await fetchSuggestions();
      const depIds = new Set(dependencies.map((d) => d.id));
      setPendingSuggestions(all.filter((s) => depIds.has(s.dependency_id)));
    } catch {
      // Silently fail — suggestions are supplemental
    }
  }, [dependencies]);

  useEffect(() => {
    loadPendingSuggestions();
  }, [loadPendingSuggestions]);

  useEffect(() => {
    if (selectedDepId) {
      loadAssociations();
    }
  }, [selectedDepId, loadAssociations]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      await generateServiceSuggestions(serviceId);
      await loadPendingSuggestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate suggestions');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAccept = async (id: string) => {
    try {
      await acceptSuggestion(id);
      setPendingSuggestions((prev) => prev.filter((s) => s.id !== id));
      if (selectedDepId) loadAssociations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept suggestion');
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await dismissSuggestion(id);
      setPendingSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss suggestion');
    }
  };

  const openForm = (depId: string) => {
    setFormDepId(depId);
    setIsFormOpen(true);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    if (selectedDepId) loadAssociations();
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Associations</h2>
        <button
          className={styles.generateButton}
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? 'Generating...' : 'Generate Suggestions'}
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {pendingSuggestions.length > 0 && (
        <div className={styles.suggestionsSection}>
          <h3 className={styles.subsectionTitle}>
            Pending Suggestions ({pendingSuggestions.length})
          </h3>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Dependency</th>
                  <th>Linked Service</th>
                  <th>Type</th>
                  <th>Confidence</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingSuggestions.map((s) => (
                  <tr key={s.id}>
                    <td className={styles.nameCell}>{s.dependency_name}</td>
                    <td>{s.linked_service_name}</td>
                    <td>
                      <span className={styles.typeBadge}>
                        {ASSOCIATION_TYPE_LABELS[s.association_type]}
                      </span>
                    </td>
                    <td className={styles.confidenceCell}>
                      {s.confidence_score !== null
                        ? `${Math.round(s.confidence_score * 100)}%`
                        : '-'}
                    </td>
                    <td className={styles.actionsCell}>
                      <button
                        className={styles.acceptButton}
                        onClick={() => handleAccept(s.id)}
                        title="Accept"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 8l3.5 3.5L13 5" />
                        </svg>
                      </button>
                      <button
                        className={styles.dismissButton}
                        onClick={() => handleDismiss(s.id)}
                        title="Dismiss"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={styles.depList}>
        {dependencies.map((dep) => (
          <div key={dep.id} className={styles.depItem}>
            <div className={styles.depHeader}>
              <span className={styles.depName}>{dep.name}</span>
              <div className={styles.depActions}>
                <button
                  className={styles.viewButton}
                  onClick={() => setSelectedDepId(selectedDepId === dep.id ? null : dep.id)}
                >
                  {selectedDepId === dep.id ? 'Hide' : 'View'} Associations
                </button>
                <button
                  className={styles.addButton}
                  onClick={() => openForm(dep.id)}
                  title="Add association"
                >
                  + Add
                </button>
              </div>
            </div>
            {selectedDepId === dep.id && (
              <div className={styles.assocList}>
                {isLoading ? (
                  <div className={styles.loading}>Loading...</div>
                ) : associations.length === 0 ? (
                  <div className={styles.empty}>No associations for this dependency.</div>
                ) : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Linked Service</th>
                          <th>Type</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {associations.map((a) => (
                          <tr key={a.id}>
                            <td className={styles.nameCell}>{a.linked_service.name}</td>
                            <td>
                              <span className={styles.typeBadge}>
                                {ASSOCIATION_TYPE_LABELS[a.association_type]}
                              </span>
                            </td>
                            <td className={styles.actionsCell}>
                              <button
                                className={styles.dismissButton}
                                onClick={() => removeAssociation(a.linked_service_id)}
                                title="Remove"
                              >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M4 4l8 8M12 4l-8 8" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="Add Association"
        size="medium"
      >
        <AssociationForm
          dependencyId={formDepId}
          onSuccess={handleFormSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      </Modal>
    </div>
  );
}

export default ServiceAssociations;
