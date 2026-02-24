import { useState, useEffect, useCallback } from 'react';
import { useManageAssociations } from '../../../hooks/useManageAssociations';
import { useAliases } from '../../../hooks/useAliases';
import { useCanonicalOverrides } from '../../../hooks/useCanonicalOverrides';
import { useAuth } from '../../../contexts/AuthContext';
import { ASSOCIATION_TYPE_LABELS } from '../../../types/association';
import type { Association } from '../../../types/association';
import AssociationForm from './AssociationForm';
import ConfirmDialog from '../../common/ConfirmDialog';
import styles from './ManageAssociations.module.css';

interface ContactEntry {
  key: string;
  value: string;
}

/**
 * Parse a JSON contact string into key-value pairs for display.
 */
function parseContact(contactJson: string | null): Record<string, string> | null {
  if (!contactJson) return null;
  try {
    const parsed = JSON.parse(contactJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return null;
  } catch {
    return null;
  }
}

function ManageAssociations() {
  const { user, isAdmin } = useAuth();
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
  const {
    overrides: canonicalOverrides,
    loadOverrides: loadCanonicalOverrides,
    saveOverride: saveCanonicalOverride,
    removeOverride: removeCanonicalOverride,
    getOverride: getCanonicalOverride,
  } = useCanonicalOverrides();

  const [addingForDepId, setAddingForDepId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ depId: string; assoc: Association } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [addingAliasForDepId, setAddingAliasForDepId] = useState<string | null>(null);
  const [canonicalInput, setCanonicalInput] = useState('');
  const [aliasError, setAliasError] = useState<string | null>(null);

  // Canonical override editing state
  const [editingOverrideFor, setEditingOverrideFor] = useState<string | null>(null);
  const [overrideContactEntries, setOverrideContactEntries] = useState<ContactEntry[]>([]);
  const [overrideImpact, setOverrideImpact] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [isClearingOverride, setIsClearingOverride] = useState(false);

  useEffect(() => {
    loadAliases();
    loadCanonicalNames();
    loadCanonicalOverrides();
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

  /**
   * Check if the current user can edit canonical overrides for a given service.
   * Admin or team lead of the service's owning team.
   */
  const canEditCanonicalOverride = useCallback((serviceTeamId: string): boolean => {
    if (isAdmin) return true;
    if (!user) return false;
    const membership = user.teams?.find(t => t.team_id === serviceTeamId);
    return membership?.role === 'lead';
  }, [isAdmin, user]);

  const openOverrideEdit = useCallback((canonicalName: string) => {
    const existing = getCanonicalOverride(canonicalName);
    const existingContact = existing ? parseContact(existing.contact_override) : null;
    const entries: ContactEntry[] = existingContact
      ? Object.entries(existingContact).map(([key, value]) => ({ key, value: String(value) }))
      : [];
    setOverrideContactEntries(entries);
    setOverrideImpact(existing?.impact_override || '');
    setOverrideError(null);
    setEditingOverrideFor(canonicalName);
  }, [getCanonicalOverride]);

  const handleOverrideSave = useCallback(async () => {
    if (!editingOverrideFor) return;
    setIsSavingOverride(true);
    setOverrideError(null);
    try {
      const validEntries = overrideContactEntries.filter(e => e.key.trim());
      const contactObj = validEntries.length > 0
        ? Object.fromEntries(validEntries.map(e => [e.key.trim(), e.value]))
        : null;
      const impactVal = overrideImpact.trim() || null;

      if (contactObj === null && impactVal === null) {
        setOverrideError('Provide at least one override, or use Clear to remove all.');
        setIsSavingOverride(false);
        return;
      }

      await saveCanonicalOverride(editingOverrideFor, {
        contact_override: contactObj,
        impact_override: impactVal,
      });
      setEditingOverrideFor(null);
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Failed to save override');
    } finally {
      setIsSavingOverride(false);
    }
  }, [editingOverrideFor, overrideContactEntries, overrideImpact, saveCanonicalOverride]);

  const handleOverrideClear = useCallback(async (canonicalName: string) => {
    setIsClearingOverride(true);
    setOverrideError(null);
    try {
      await removeCanonicalOverride(canonicalName);
      setEditingOverrideFor(null);
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Failed to clear override');
    } finally {
      setIsClearingOverride(false);
    }
  }, [removeCanonicalOverride]);

  const addContactEntry = useCallback(() => {
    setOverrideContactEntries(prev => [...prev, { key: '', value: '' }]);
  }, []);

  const removeContactEntry = useCallback((index: number) => {
    setOverrideContactEntries(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateContactEntry = useCallback((index: number, field: 'key' | 'value', val: string) => {
    setOverrideContactEntries(prev =>
      prev.map((entry, i) => i === index ? { ...entry, [field]: val } : entry)
    );
  }, []);

  const renderCanonicalOverrideSection = (dep: { canonical_name: string | null }, serviceTeamId: string) => {
    const canonicalName = dep.canonical_name;
    const canEdit = canEditCanonicalOverride(serviceTeamId);

    if (!canonicalName) {
      return (
        <div className={styles.canonicalOverrideSection}>
          <div className={styles.aliasSectionHeader}>Canonical Overrides</div>
          <div className={styles.canonicalOverrideNote}>
            A canonical name must be established (via alias) before canonical overrides can be set.
          </div>
        </div>
      );
    }

    const existing = getCanonicalOverride(canonicalName);
    const isEditing = editingOverrideFor === canonicalName;
    const contactData = existing ? parseContact(existing.contact_override) : null;

    return (
      <div className={styles.canonicalOverrideSection}>
        <div className={styles.aliasSectionHeader}>Canonical Overrides</div>

        {existing && !isEditing && (
          <div className={styles.canonicalOverrideDisplay}>
            <div className={styles.overrideIndicator}>Canonical override active</div>
            {contactData && (
              <div className={styles.overrideFieldGroup}>
                <span className={styles.overrideFieldLabel}>Contact:</span>
                <div className={styles.overrideContactList}>
                  {Object.entries(contactData).map(([key, value]) => (
                    <span key={key} className={styles.overrideContactItem}>
                      {key}: {value}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {existing.impact_override && (
              <div className={styles.overrideFieldGroup}>
                <span className={styles.overrideFieldLabel}>Impact:</span>
                <span className={styles.overrideFieldValue}>{existing.impact_override}</span>
              </div>
            )}
          </div>
        )}

        {!isEditing && !existing && (
          <div className={styles.noAssociations}>No canonical override set.</div>
        )}

        {canEdit && !isEditing && (
          <button
            className={styles.addButton}
            onClick={() => openOverrideEdit(canonicalName)}
          >
            {existing ? 'Edit Override' : '+ Add Override'}
          </button>
        )}

        {isEditing && (
          <div className={styles.overrideForm}>
            <div className={styles.overrideFormGroup}>
              <label className={styles.overrideFormLabel}>Contact</label>
              {overrideContactEntries.map((entry, i) => (
                <div key={i} className={styles.overrideContactEntryRow}>
                  <input
                    className={styles.aliasInput}
                    value={entry.key}
                    onChange={(e) => updateContactEntry(i, 'key', e.target.value)}
                    placeholder="Key (e.g. email)"
                  />
                  <input
                    className={styles.aliasInput}
                    value={entry.value}
                    onChange={(e) => updateContactEntry(i, 'value', e.target.value)}
                    placeholder="Value"
                  />
                  <button
                    className={styles.deleteButton}
                    onClick={() => removeContactEntry(i)}
                    title="Remove entry"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                className={styles.addButton}
                onClick={addContactEntry}
                type="button"
              >
                + Add Field
              </button>
            </div>

            <div className={styles.overrideFormGroup}>
              <label className={styles.overrideFormLabel}>Impact</label>
              <input
                className={styles.aliasInput}
                value={overrideImpact}
                onChange={(e) => setOverrideImpact(e.target.value)}
                placeholder="Impact statement"
              />
            </div>

            {overrideError && <div className={styles.aliasError}>{overrideError}</div>}

            <div className={styles.overrideFormActions}>
              <button
                className={styles.addButton}
                onClick={handleOverrideSave}
                disabled={isSavingOverride}
              >
                {isSavingOverride ? 'Saving...' : 'Save'}
              </button>
              {existing && (
                <button
                  className={styles.overrideClearButton}
                  onClick={() => handleOverrideClear(canonicalName)}
                  disabled={isClearingOverride}
                >
                  {isClearingOverride ? 'Clearing...' : 'Clear Override'}
                </button>
              )}
              <button
                className={styles.addButton}
                onClick={() => {
                  setEditingOverrideFor(null);
                  setOverrideError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
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

                                {/* Canonical overrides section */}
                                {renderCanonicalOverrideSection(dep, service.team_id)}
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
