import { useState, useEffect, useCallback } from 'react';
import { useAliases } from '../../../hooks/useAliases';
import {
  fetchAssociations,
  fetchSuggestions,
  deleteAssociation,
  acceptSuggestion,
  dismissSuggestion,
} from '../../../api/associations';
import { updateDependencyOverrides, clearDependencyOverrides } from '../../../api/dependencies';
import type { Dependency } from '../../../types/service';
import type { Association, AssociationSuggestion } from '../../../types/association';
import { ASSOCIATION_TYPE_LABELS } from '../../../types/association';
import DependencyRow from './DependencyRow';
import DependencyEditModal from './DependencyEditModal';
import styles from './DependencyList.module.css';

interface DependencyListProps {
  serviceId: string;
  dependencies: Dependency[];
  canEditOverrides: boolean;
  onServiceReload: () => Promise<void>;
}

function DependencyList({ serviceId, dependencies, canEditOverrides, onServiceReload }: DependencyListProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editingDep, setEditingDep] = useState<Dependency | null>(null);
  const [assocMap, setAssocMap] = useState<Record<string, Association[]>>({});
  const [pendingSuggestions, setPendingSuggestions] = useState<AssociationSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const {
    aliases,
    canonicalNames,
    loadAliases,
    loadCanonicalNames,
    addAlias,
    editAlias,
    removeAlias,
  } = useAliases();

  // Load associations for all dependencies
  const loadAllAssociations = useCallback(async () => {
    if (dependencies.length === 0) return;
    try {
      const results = await Promise.all(
        dependencies.map(async (dep) => {
          const assocs = await fetchAssociations(dep.id);
          return [dep.id, assocs] as const;
        }),
      );
      setAssocMap(Object.fromEntries(results));
    } catch {
      // Non-critical
    }
  }, [dependencies]);

  const reloadDepAssociations = useCallback(async (depId: string) => {
    try {
      const assocs = await fetchAssociations(depId);
      setAssocMap((prev) => ({ ...prev, [depId]: assocs }));
    } catch {
      // Non-critical
    }
  }, []);

  // Load pending suggestions
  const loadPendingSuggestions = useCallback(async () => {
    try {
      const all = await fetchSuggestions();
      const depIds = new Set(dependencies.map((d) => d.id));
      setPendingSuggestions(all.filter((s) => depIds.has(s.dependency_id)));
    } catch {
      // Non-critical
    }
  }, [dependencies]);

  useEffect(() => {
    loadAliases();
    loadCanonicalNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAllAssociations();
  }, [loadAllAssociations]);

  useEffect(() => {
    loadPendingSuggestions();
  }, [loadPendingSuggestions]);

  const toggleRow = useCallback((depId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(depId)) {
        next.delete(depId);
      } else {
        next.add(depId);
      }
      return next;
    });
  }, []);

  const findAliasForDep = useCallback(
    (depName: string) => aliases.find((a) => a.alias === depName),
    [aliases],
  );

  // Suggestion handlers
  const handleAccept = async (id: string) => {
    try {
      const suggestion = pendingSuggestions.find((s) => s.id === id);
      await acceptSuggestion(id);
      setPendingSuggestions((prev) => prev.filter((s) => s.id !== id));
      if (suggestion) await reloadDepAssociations(suggestion.dependency_id);
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

  // Override handlers for the edit modal
  const handleOverrideSave = useCallback(async (depId: string, impact: string | null, contact: Record<string, string> | null) => {
    await updateDependencyOverrides(depId, {
      contact_override: contact,
      impact_override: impact,
    });
    setEditingDep(null);
    await onServiceReload();
  }, [onServiceReload]);

  const handleOverrideClear = useCallback(async (depId: string) => {
    await clearDependencyOverrides(depId);
    setEditingDep(null);
    await onServiceReload();
  }, [onServiceReload]);

  // Alias handlers for the edit modal
  const handleAliasSave = useCallback(async (depName: string, aliasId: string | undefined, canonicalName: string) => {
    if (aliasId) {
      await editAlias(aliasId, canonicalName);
    } else {
      await addAlias({ alias: depName, canonical_name: canonicalName });
    }
    await onServiceReload();
  }, [editAlias, addAlias, onServiceReload]);

  const handleAliasRemove = useCallback(async (aliasId: string) => {
    await removeAlias(aliasId);
    await onServiceReload();
  }, [removeAlias, onServiceReload]);

  // Association handlers for the edit modal
  const handleRemoveAssociation = useCallback(async (depId: string, linkedServiceId: string) => {
    await deleteAssociation(depId, linkedServiceId);
    setAssocMap((prev) => ({
      ...prev,
      [depId]: (prev[depId] || []).filter((a) => a.linked_service_id !== linkedServiceId),
    }));
  }, []);

  const handleAssociationAdded = useCallback(() => {
    if (editingDep) {
      reloadDepAssociations(editingDep.id);
    }
  }, [editingDep, reloadDepAssociations]);

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Dependencies</h2>
          <span className={styles.sectionSubtitle}>What this service depends on</span>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {pendingSuggestions.length > 0 && (
        <div className={styles.suggestionsSection}>
          <h3 className={styles.subsectionTitle}>
            Pending Suggestions ({pendingSuggestions.length})
          </h3>
          <div className={styles.suggestionsTable}>
            <table>
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
                    <td>{s.dependency_name}</td>
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
                    <td>
                      <div className={styles.suggestionActions}>
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dependencies.length === 0 ? (
        <div className={styles.noDeps}>
          <p>No dependencies registered for this service.</p>
        </div>
      ) : (
        <div className={styles.depList}>
          {dependencies.map((dep) => (
            <DependencyRow
              key={dep.id}
              dep={dep}
              serviceId={serviceId}
              isExpanded={expandedRows.has(dep.id)}
              onToggleExpand={() => toggleRow(dep.id)}
              onEdit={() => setEditingDep(dep)}
              canEdit={canEditOverrides}
              associations={assocMap[dep.id] || []}
              alias={findAliasForDep(dep.name)}
            />
          ))}
        </div>
      )}

      <DependencyEditModal
        dep={editingDep}
        onClose={() => setEditingDep(null)}
        onOverrideSave={handleOverrideSave}
        onOverrideClear={handleOverrideClear}
        alias={editingDep ? findAliasForDep(editingDep.name) : undefined}
        canonicalNames={canonicalNames}
        onAliasSave={handleAliasSave}
        onAliasRemove={handleAliasRemove}
        associations={editingDep ? (assocMap[editingDep.id] || []) : []}
        onRemoveAssociation={handleRemoveAssociation}
        onAssociationAdded={handleAssociationAdded}
      />
    </>
  );
}

export default DependencyList;
