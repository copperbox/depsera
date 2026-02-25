import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useAssociations } from '../../../hooks/useAssociations';
import { useAliases } from '../../../hooks/useAliases';
import { generateServiceSuggestions, fetchSuggestions } from '../../../api/associations';
import type { Dependency } from '../../../types/service';
import type { DependencyAlias } from '../../../types/alias';
import type { AssociationSuggestion } from '../../../types/association';
import { ASSOCIATION_TYPE_LABELS } from '../../../types/association';
import { acceptSuggestion, dismissSuggestion } from '../../../api/associations';
import Modal from '../../common/Modal';
import AssociationForm from '../Associations/AssociationForm';
import styles from './ServiceAssociations.module.css';

interface ServiceAssociationsProps {
  serviceId: string;
  dependencies: Dependency[];
  onAliasChange?: () => void;
}

function ServiceAssociations({ serviceId, dependencies, onAliasChange }: ServiceAssociationsProps) {
  const { isAdmin } = useAuth();
  const [selectedDepId, setSelectedDepId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formDepId, setFormDepId] = useState<string>('');
  const [pendingSuggestions, setPendingSuggestions] = useState<AssociationSuggestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Alias editing state
  const [editingAliasDep, setEditingAliasDep] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState('');
  const [isSavingAlias, setIsSavingAlias] = useState(false);

  const {
    associations,
    isLoading,
    loadAssociations,
    removeAssociation,
  } = useAssociations(selectedDepId || undefined);

  const {
    aliases,
    canonicalNames,
    loadAliases,
    loadCanonicalNames,
    addAlias,
    editAlias,
    removeAlias,
  } = useAliases();

  // Load aliases on mount
  useEffect(() => {
    loadAliases();
    loadCanonicalNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Find alias record for a dependency name */
  const findAliasForDep = useCallback(
    (depName: string): DependencyAlias | undefined =>
      aliases.find((a) => a.alias === depName),
    [aliases],
  );

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

  /* istanbul ignore next -- @preserve
     handleFormSuccess is triggered by AssociationForm inside a Modal.
     Testing requires HTMLDialogElement mocking. Integration tests preferred. */
  const handleFormSuccess = () => {
    setIsFormOpen(false);
    if (selectedDepId) loadAssociations();
  };

  const startAliasEdit = (dep: Dependency) => {
    setEditingAliasDep(dep.id);
    setAliasInput(dep.canonical_name || '');
  };

  const cancelAliasEdit = () => {
    setEditingAliasDep(null);
    setAliasInput('');
  };

  const handleAliasSave = async (dep: Dependency) => {
    const trimmed = aliasInput.trim();
    const existing = findAliasForDep(dep.name);
    setIsSavingAlias(true);
    setError(null);
    try {
      if (!trimmed && existing) {
        // Remove alias
        await removeAlias(existing.id);
      } else if (trimmed && existing) {
        // Update alias
        await editAlias(existing.id, trimmed);
      } else if (trimmed && !existing) {
        // Create alias
        await addAlias({ alias: dep.name, canonical_name: trimmed });
      }
      setEditingAliasDep(null);
      setAliasInput('');
      onAliasChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save alias');
    } finally {
      setIsSavingAlias(false);
    }
  };

  const handleAliasRemove = async (dep: Dependency) => {
    const existing = findAliasForDep(dep.name);
    if (!existing) return;
    setIsSavingAlias(true);
    setError(null);
    try {
      await removeAlias(existing.id);
      onAliasChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove alias');
    } finally {
      setIsSavingAlias(false);
    }
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
        {dependencies.map((dep) => {
          const depAlias = findAliasForDep(dep.name);
          const isEditingThis = editingAliasDep === dep.id;

          return (
            <div key={dep.id} className={styles.depItem}>
              <div className={styles.depHeader}>
                <div className={styles.depNameGroup}>
                  <span className={styles.depName}>{dep.name}</span>
                  {depAlias && !isEditingThis && (
                    <span className={styles.aliasBadge} title={`Alias: ${dep.name} → ${depAlias.canonical_name}`}>
                      {depAlias.canonical_name}
                    </span>
                  )}
                </div>
                <div className={styles.depActions}>
                  {isAdmin && (
                    <button
                      className={styles.aliasButton}
                      onClick={() => isEditingThis ? cancelAliasEdit() : startAliasEdit(dep)}
                      title={depAlias ? 'Edit alias' : 'Set alias'}
                    >
                      {isEditingThis ? 'Cancel' : depAlias ? 'Edit Alias' : '+ Alias'}
                    </button>
                  )}
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

              {isEditingThis && (
                <div className={styles.aliasEditRow}>
                  <label className={styles.aliasEditLabel}>Canonical Name</label>
                  <div className={styles.aliasEditInputGroup}>
                    <input
                      className={styles.aliasEditInput}
                      list={`canonical-names-${dep.id}`}
                      value={aliasInput}
                      onChange={(e) => setAliasInput(e.target.value)}
                      placeholder="e.g. Primary Database"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAliasSave(dep);
                        } else if (e.key === 'Escape') {
                          cancelAliasEdit();
                        }
                      }}
                    />
                    <datalist id={`canonical-names-${dep.id}`}>
                      {canonicalNames.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                    <button
                      className={styles.aliasEditSave}
                      onClick={() => handleAliasSave(dep)}
                      disabled={isSavingAlias}
                      title="Save alias"
                    >
                      {isSavingAlias ? '...' : 'Save'}
                    </button>
                    {depAlias && (
                      <button
                        className={styles.aliasEditRemove}
                        onClick={() => handleAliasRemove(dep)}
                        disabled={isSavingAlias}
                        title="Remove alias"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )}

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
          );
        })}
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
