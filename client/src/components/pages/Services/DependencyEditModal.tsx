import { useState, useCallback, useEffect } from 'react';
import type { Dependency } from '../../../types/service';
import type { Association } from '../../../types/association';
import type { DependencyAlias } from '../../../types/alias';
import { ASSOCIATION_TYPE_LABELS } from '../../../types/association';
import { parseContact, hasActiveOverride } from '../../../utils/dependency';
import Modal from '../../common/Modal';
import AssociationForm from '../Associations/AssociationForm';
import styles from './DependencyEditModal.module.css';

interface ContactEntry {
  key: string;
  value: string;
}

interface DependencyEditModalProps {
  dep: Dependency | null;
  onClose: () => void;
  // Override callbacks
  onOverrideSave: (depId: string, impact: string | null, contact: Record<string, string> | null) => Promise<void>;
  onOverrideClear: (depId: string) => Promise<void>;
  // Alias
  alias: DependencyAlias | undefined;
  canonicalNames: string[];
  onAliasSave: (depName: string, aliasId: string | undefined, canonicalName: string) => Promise<void>;
  onAliasRemove: (aliasId: string) => Promise<void>;
  // Associations
  associations: Association[];
  onRemoveAssociation: (depId: string, linkedServiceId: string) => Promise<void>;
  onAssociationAdded: () => void;
}

function DependencyEditModal({
  dep,
  onClose,
  onOverrideSave,
  onOverrideClear,
  alias,
  canonicalNames,
  onAliasSave,
  onAliasRemove,
  associations,
  onRemoveAssociation,
  onAssociationAdded,
}: DependencyEditModalProps) {
  // Override state
  const [contactEntries, setContactEntries] = useState<ContactEntry[]>([]);
  const [impactOverride, setImpactOverride] = useState('');
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [isClearingOverride, setIsClearingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Alias state
  const [aliasInput, setAliasInput] = useState('');
  const [isSavingAlias, setIsSavingAlias] = useState(false);
  const [aliasError, setAliasError] = useState<string | null>(null);

  // Association state
  const [showAssocForm, setShowAssocForm] = useState(false);
  const [assocError, setAssocError] = useState<string | null>(null);

  // Reset form state when dep changes
  useEffect(() => {
    if (dep) {
      const existingContact = parseContact(dep.contact_override);
      const entries: ContactEntry[] = existingContact
        ? Object.entries(existingContact).map(([key, value]) => ({ key, value: String(value) }))
        : [];
      setContactEntries(entries);
      setImpactOverride(dep.impact_override || '');
      setOverrideError(null);
      setAliasInput(dep.canonical_name || '');
      setAliasError(null);
      setShowAssocForm(false);
      setAssocError(null);
    }
  }, [dep]);

  const handleOverrideSave = useCallback(async () => {
    if (!dep) return;
    setIsSavingOverride(true);
    setOverrideError(null);
    try {
      const validEntries = contactEntries.filter(e => e.key.trim());
      const contactObj = validEntries.length > 0
        ? Object.fromEntries(validEntries.map(e => [e.key.trim(), e.value]))
        : null;
      const impactVal = impactOverride.trim() || null;

      if (contactObj === null && impactVal === null) {
        setOverrideError('Provide at least one override, or use Clear to remove all.');
        setIsSavingOverride(false);
        return;
      }

      await onOverrideSave(dep.id, impactVal, contactObj);
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Failed to save overrides');
    } finally {
      setIsSavingOverride(false);
    }
  }, [dep, contactEntries, impactOverride, onOverrideSave]);

  const handleOverrideClear = useCallback(async () => {
    if (!dep) return;
    setIsClearingOverride(true);
    setOverrideError(null);
    try {
      await onOverrideClear(dep.id);
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Failed to clear overrides');
    } finally {
      setIsClearingOverride(false);
    }
  }, [dep, onOverrideClear]);

  const handleAliasSave = useCallback(async () => {
    if (!dep) return;
    const trimmed = aliasInput.trim();
    if (!trimmed) return;
    setIsSavingAlias(true);
    setAliasError(null);
    try {
      await onAliasSave(dep.name, alias?.id, trimmed);
    } catch (err) {
      setAliasError(err instanceof Error ? err.message : 'Failed to save alias');
    } finally {
      setIsSavingAlias(false);
    }
  }, [dep, aliasInput, alias, onAliasSave]);

  const handleAliasRemove = useCallback(async () => {
    if (!alias) return;
    setIsSavingAlias(true);
    setAliasError(null);
    try {
      await onAliasRemove(alias.id);
      setAliasInput('');
    } catch (err) {
      setAliasError(err instanceof Error ? err.message : 'Failed to remove alias');
    } finally {
      setIsSavingAlias(false);
    }
  }, [alias, onAliasRemove]);

  const handleRemoveAssoc = useCallback(async (linkedServiceId: string) => {
    if (!dep) return;
    setAssocError(null);
    try {
      await onRemoveAssociation(dep.id, linkedServiceId);
    } catch (err) {
      setAssocError(err instanceof Error ? err.message : 'Failed to remove association');
    }
  }, [dep, onRemoveAssociation]);

  const handleAssocFormSuccess = useCallback(() => {
    setShowAssocForm(false);
    onAssociationAdded();
  }, [onAssociationAdded]);

  if (!dep) return null;

  return (
    <Modal
      isOpen={dep !== null}
      onClose={onClose}
      title={`Edit — ${dep.canonical_name || dep.name}`}
      size="large"
    >
      {/* Overrides Section */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Overrides</h3>

        {overrideError && <div className={styles.error}>{overrideError}</div>}

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Impact Override</label>
          <input
            type="text"
            className={styles.input}
            value={impactOverride}
            onChange={(e) => setImpactOverride(e.target.value)}
            placeholder="e.g. Critical — primary database"
          />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Contact Override</label>
          {contactEntries.map((entry, index) => (
            <div key={index} className={styles.contactEntryRow}>
              <input
                type="text"
                className={styles.contactKeyInput}
                value={entry.key}
                onChange={(e) => {
                  const next = [...contactEntries];
                  next[index] = { ...next[index], key: e.target.value };
                  setContactEntries(next);
                }}
                placeholder="Key (e.g. email)"
              />
              <input
                type="text"
                className={styles.contactValueInput}
                value={entry.value}
                onChange={(e) => {
                  const next = [...contactEntries];
                  next[index] = { ...next[index], value: e.target.value };
                  setContactEntries(next);
                }}
                placeholder="Value"
              />
              <button
                type="button"
                className={styles.contactRemoveButton}
                onClick={() => setContactEntries(contactEntries.filter((_, i) => i !== index))}
                title="Remove entry"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.addFieldButton}
            onClick={() => setContactEntries([...contactEntries, { key: '', value: '' }])}
          >
            + Add Field
          </button>
        </div>

        <div className={styles.overrideActions}>
          {hasActiveOverride(dep) && (
            <button
              type="button"
              className={styles.btnDanger}
              onClick={handleOverrideClear}
              disabled={isClearingOverride || isSavingOverride}
            >
              {isClearingOverride ? 'Clearing...' : 'Clear All Overrides'}
            </button>
          )}
          <div className={styles.overrideActionsRight}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleOverrideSave}
              disabled={isSavingOverride || isClearingOverride}
            >
              {isSavingOverride ? 'Saving...' : 'Save Overrides'}
            </button>
          </div>
        </div>
      </div>

      {/* Alias Section */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Alias</h3>

        {aliasError && <div className={styles.error}>{aliasError}</div>}

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Canonical Name</label>
          <div className={styles.aliasInputGroup}>
            <input
              className={styles.aliasInput}
              list="canonical-names-edit"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              placeholder="e.g. Primary Database"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAliasSave();
                }
              }}
            />
            <datalist id="canonical-names-edit">
              {canonicalNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <button
              className={styles.btnPrimary}
              onClick={handleAliasSave}
              disabled={isSavingAlias || !aliasInput.trim()}
            >
              {isSavingAlias ? '...' : 'Save Alias'}
            </button>
            {alias && (
              <button
                className={styles.btnDanger}
                onClick={handleAliasRemove}
                disabled={isSavingAlias}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Associations Section */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Associations</h3>

        {assocError && <div className={styles.error}>{assocError}</div>}

        {associations.length === 0 ? (
          <div className={styles.emptyAssoc}>No associations for this dependency.</div>
        ) : (
          <div className={styles.assocTable}>
            <table>
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
                    <td>{a.linked_service.name}</td>
                    <td>
                      <span className={styles.typeBadge}>
                        {ASSOCIATION_TYPE_LABELS[a.association_type]}
                      </span>
                    </td>
                    <td>
                      <button
                        className={styles.removeButton}
                        onClick={() => handleRemoveAssoc(a.linked_service_id)}
                        title="Remove association"
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

        {showAssocForm ? (
          <div className={styles.assocFormWrapper}>
            <AssociationForm
              dependencyId={dep.id}
              onSuccess={handleAssocFormSuccess}
              onCancel={() => setShowAssocForm(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            className={styles.addAssocButton}
            onClick={() => setShowAssocForm(true)}
          >
            + Add Association
          </button>
        )}
      </div>
    </Modal>
  );
}

export default DependencyEditModal;
