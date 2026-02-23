import { useState, useEffect } from 'react';
import { useManageAssociations } from '../../../hooks/useManageAssociations';
import { useAliases } from '../../../hooks/useAliases';
import { useAuth } from '../../../contexts/AuthContext';
import { ASSOCIATION_TYPE_LABELS } from '../../../types/association';
import type { Association } from '../../../types/association';
import AssociationForm from './AssociationForm';
import ConfirmDialog from '../../common/ConfirmDialog';
import styles from './ManageAssociations.module.css';

function ManageAssociations() {
  const { isAdmin } = useAuth();
  const {
    filteredServices,
    isLoading,
    error,
    expandedServiceIds,
    expandedDependencyIds,
    toggleService,
    toggleDependency,
    associationCache,
    removeAssociation,
    refreshAssociations,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
  } = useManageAssociations();
  const {
    aliases,
    canonicalNames,
    loadAliases,
    loadCanonicalNames,
    addAlias,
    removeAlias,
  } = useAliases();

  const [addingForDepId, setAddingForDepId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ depId: string; assoc: Association } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [addingAliasForDepId, setAddingAliasForDepId] = useState<string | null>(null);
  const [canonicalInput, setCanonicalInput] = useState('');
  const [aliasError, setAliasError] = useState<string | null>(null);

  useEffect(() => {
    loadAliases();
    loadCanonicalNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await removeAssociation(deleteTarget.depId, deleteTarget.assoc.linked_service_id);
      setDeleteTarget(null);
    } catch {
      // Error is logged in the hook
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddSuccess = (depId: string) => {
    setAddingForDepId(null);
    refreshAssociations(depId);
  };

  const handleAliasSubmit = async (depName: string) => {
    const canonical = canonicalInput.trim();
    if (!canonical) return;
    setAliasError(null);
    try {
      await addAlias({ alias: depName, canonical_name: canonical });
      setCanonicalInput('');
      setAddingAliasForDepId(null);
    } catch (err) {
      setAliasError(err instanceof Error ? err.message : 'Failed to create alias');
    }
  };

  const handleAliasDelete = async (aliasId: string) => {
    try {
      await removeAlias(aliasId);
    } catch {
      // error logged in hook
    }
  };

  const renderAliasSection = (depId: string, depName: string) => {
    const depAliases = aliases.filter((a) => a.alias === depName);
    const isShowingAliasForm = addingAliasForDepId === depId;

    return (
      <div className={styles.aliasSection}>
        <div className={styles.aliasSectionHeader}>Aliases</div>
        {depAliases.length > 0 && (
          <div className={styles.aliasList}>
            {depAliases.map((a) => (
              <div key={a.id} className={styles.aliasItem}>
                <span className={styles.aliasCanonical}>&rarr; {a.canonical_name}</span>
                {isAdmin && (
                  <button
                    className={styles.deleteButton}
                    onClick={() => handleAliasDelete(a.id)}
                    title="Delete alias"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          isShowingAliasForm ? (
            <div>
              <div className={styles.aliasForm}>
                <input
                  className={styles.aliasInput}
                  list={`canonical-names-${depId}`}
                  value={canonicalInput}
                  onChange={(e) => {
                    setCanonicalInput(e.target.value);
                    setAliasError(null);
                  }}
                  placeholder="Canonical name"
                />
                <datalist id={`canonical-names-${depId}`}>
                  {canonicalNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <button
                  className={styles.addButton}
                  onClick={() => handleAliasSubmit(depName)}
                  disabled={!canonicalInput.trim()}
                >
                  Save
                </button>
                <button
                  className={styles.addButton}
                  onClick={() => {
                    setAddingAliasForDepId(null);
                    setCanonicalInput('');
                    setAliasError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
              {aliasError && <div className={styles.aliasError}>{aliasError}</div>}
            </div>
          ) : (
            <button
              className={styles.addAliasButton}
              onClick={() => {
                setAddingAliasForDepId(depId);
                setCanonicalInput('');
                setAliasError(null);
              }}
            >
              + Add Alias
            </button>
          )
        )}
      </div>
    );
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading services and dependencies...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <div>
      <div className={styles.searchBar}>
        <div className={styles.searchWrapper}>
          <svg
            className={styles.searchIcon}
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="7" cy="7" r="4" />
            <path d="M10 10l3.5 3.5" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search services and dependencies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'linked' | 'unlinked')}
          aria-label="Filter by status"
        >
          <option value="all">All</option>
          <option value="linked">Linked</option>
          <option value="unlinked">Unlinked</option>
        </select>
      </div>

      {filteredServices.length === 0 ? (
        <div className={styles.empty}>
          {searchQuery || statusFilter !== 'all'
            ? 'No services match your filters.'
            : 'No services with dependencies found.'}
        </div>
      ) : (
        filteredServices.map((service) => {
          const isServiceExpanded = expandedServiceIds.has(service.id);

          return (
            <div key={service.id} className={styles.serviceGroup}>
              <button
                className={`${styles.serviceHeader} ${isServiceExpanded ? styles.serviceHeaderExpanded : ''}`}
                onClick={() => toggleService(service.id)}
                aria-expanded={isServiceExpanded}
              >
                <span className={styles.chevron}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </span>
                <span className={styles.serviceHeaderName}>{service.name}</span>
                <span className={styles.depCount}>
                  {service.dependencies.length}{' '}
                  {service.dependencies.length === 1 ? 'dependency' : 'dependencies'}
                </span>
              </button>

              {isServiceExpanded && (
                <div className={styles.depList}>
                  {service.dependencies.map((dep) => {
                    const isDepExpanded = expandedDependencyIds.has(dep.id);
                    const assocs = associationCache.get(dep.id);
                    const assocCount = assocs?.length ?? 0;
                    const isShowingForm = addingForDepId === dep.id;

                    return (
                      <div key={dep.id} className={styles.depRow}>
                        <button
                          className={`${styles.depHeader} ${isDepExpanded ? styles.depHeaderExpanded : ''}`}
                          onClick={() => toggleDependency(dep.id)}
                          aria-expanded={isDepExpanded}
                        >
                          <span className={styles.chevron}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M6 4l4 4-4 4" />
                            </svg>
                          </span>
                          <span className={styles.depName}>{dep.name}</span>
                          {assocs !== undefined && (
                            <span className={`${styles.badge} ${assocCount === 0 ? styles.badgeEmpty : ''}`}>
                              {assocCount}
                            </span>
                          )}
                        </button>

                        {isDepExpanded && (
                          <div className={styles.depPanel}>
                            {assocs === undefined ? (
                              <div className={styles.loading}>Loading associations...</div>
                            ) : (
                              <>
                                {assocs.length === 0 ? (
                                  <div className={styles.noAssociations}>No associations yet.</div>
                                ) : (
                                  <div className={styles.assocList}>
                                    {assocs.map((assoc) => (
                                      <div key={assoc.id} className={styles.assocItem}>
                                        <span className={styles.assocServiceName}>
                                          {assoc.linked_service.name}
                                        </span>
                                        <span className={styles.typeBadge}>
                                          {ASSOCIATION_TYPE_LABELS[assoc.association_type]}
                                        </span>
                                        <button
                                          className={styles.deleteButton}
                                          onClick={() => setDeleteTarget({ depId: dep.id, assoc })}
                                          title="Delete association"
                                        >
                                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M4 4l8 8M12 4l-8 8" />
                                          </svg>
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {isShowingForm ? (
                                  <div className={styles.formWrapper}>
                                    <AssociationForm
                                      dependencyId={dep.id}
                                      onSuccess={() => handleAddSuccess(dep.id)}
                                      onCancel={() => setAddingForDepId(null)}
                                    />
                                  </div>
                                ) : (
                                  <button
                                    className={styles.addButton}
                                    onClick={() => setAddingForDepId(dep.id)}
                                  >
                                    + Add Association
                                  </button>
                                )}

                                {/* Aliases section */}
                                {renderAliasSection(dep.id, dep.name)}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Association"
        message={`Remove the association to "${deleteTarget?.assoc.linked_service.name}"?`}
        confirmLabel="Delete"
        isDestructive
        isLoading={isDeleting}
      />
    </div>
  );
}

export default ManageAssociations;
