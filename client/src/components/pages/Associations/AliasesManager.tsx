import { useState, useEffect, useMemo, FormEvent } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useAliases } from '../../../hooks/useAliases';
import SearchableSelect from '../../common/SearchableSelect';
import type { SelectOption } from '../../common/SearchableSelect';
import styles from './AliasesManager.module.css';

interface AliasesManagerProps {
  dependencyOptions: SelectOption[];
}

function AliasesManager({ dependencyOptions }: AliasesManagerProps) {
  const { isAdmin } = useAuth();
  const {
    aliases,
    canonicalNames,
    isLoading,
    error,
    loadAliases,
    loadCanonicalNames,
    addAlias,
    removeAlias,
  } = useAliases();

  const [aliasInput, setAliasInput] = useState('');
  const [canonicalInput, setCanonicalInput] = useState('');

  useEffect(() => {
    loadAliases();
    loadCanonicalNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof aliases>();
    for (const a of aliases) {
      const list = map.get(a.canonical_name) || [];
      list.push(a);
      map.set(a.canonical_name, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [aliases]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const alias = aliasInput.trim();
    const canonical = canonicalInput.trim();
    if (!alias || !canonical) return;

    try {
      await addAlias({ alias, canonical_name: canonical });
      setAliasInput('');
      setCanonicalInput('');
    } catch {
      // error is set in hook
    }
  };

  return (
    <div className={styles.container}>
      <p className={styles.description}>
        Map dependency names reported by services to a canonical name.
        When multiple services report the same external dependency under different names,
        aliases unify them under one canonical identity.
      </p>

      {isAdmin && (
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <SearchableSelect
              options={dependencyOptions}
              value={aliasInput}
              onChange={setAliasInput}
              placeholder="e.g. postgres-main"
              label="Alias (reported name)"
              allowCustom
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Canonical Name</label>
            <input
              className={styles.input}
              list="canonical-names-list"
              value={canonicalInput}
              onChange={(e) => setCanonicalInput(e.target.value)}
              placeholder="e.g. Primary Database"
            />
            <datalist id="canonical-names-list">
              {canonicalNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <button
            type="submit"
            className={styles.addButton}
            disabled={!aliasInput.trim() || !canonicalInput.trim()}
          >
            Add Alias
          </button>
        </form>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {isLoading ? (
        <div className={styles.loading}>Loading aliases...</div>
      ) : grouped.length === 0 ? (
        <div className={styles.empty}>
          No aliases configured yet. Add one above to get started.
        </div>
      ) : (
        grouped.map(([canonical, items]) => (
          <div key={canonical} className={styles.group}>
            <div className={styles.groupHeader}>{canonical}</div>
            <div className={styles.aliasList}>
              {items.map((a) => (
                <div key={a.id} className={styles.aliasRow}>
                  <span className={styles.aliasName}>{a.alias}</span>
                  {isAdmin && (
                    <div className={styles.aliasActions}>
                      <button
                        className={`${styles.iconButton} ${styles.deleteButton}`}
                        onClick={() => removeAlias(a.id)}
                        title="Delete alias"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4h9.334z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default AliasesManager;
