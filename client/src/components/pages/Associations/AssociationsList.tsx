import { useState, useMemo } from 'react';
import type { Association, AssociationType } from '../../../types/association';
import { ASSOCIATION_TYPE_LABELS } from '../../../types/association';
import ConfirmDialog from '../../common/ConfirmDialog';
import styles from './AssociationsList.module.css';

interface AssociationsListProps {
  associations: Association[];
  isLoading: boolean;
  onDelete: (serviceId: string) => Promise<void>;
}

function AssociationsList({ associations, isLoading, onDelete }: AssociationsListProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AssociationType | ''>('');
  const [deleteTarget, setDeleteTarget] = useState<Association | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filtered = useMemo(() => {
    let result = associations;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.linked_service.name.toLowerCase().includes(q) ||
          a.association_type.toLowerCase().includes(q),
      );
    }
    if (typeFilter) {
      result = result.filter((a) => a.association_type === typeFilter);
    }
    return result;
  }, [associations, search, typeFilter]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await onDelete(deleteTarget.linked_service_id);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading associations...</div>;
  }

  if (associations.length === 0) {
    return <div className={styles.empty}>No associations found.</div>;
  }

  return (
    <div>
      <div className={styles.filters}>
        <div className={styles.searchWrapper}>
          <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="7" cy="7" r="4" />
            <path d="M10 10l3.5 3.5" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search associations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={styles.typeSelect}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as AssociationType | '')}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {Object.entries(ASSOCIATION_TYPE_LABELS).map(([val, lbl]) => (
            <option key={val} value={val}>{lbl}</option>
          ))}
        </select>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Linked Service</th>
              <th>Type</th>
              <th>Source</th>
              <th>Confidence</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((assoc) => (
              <tr key={assoc.id}>
                <td className={styles.nameCell}>{assoc.linked_service.name}</td>
                <td>
                  <span className={styles.typeBadge}>
                    {ASSOCIATION_TYPE_LABELS[assoc.association_type]}
                  </span>
                </td>
                <td className={styles.sourceCell}>
                  {assoc.is_auto_suggested ? 'Auto' : 'Manual'}
                </td>
                <td className={styles.confidenceCell}>
                  {assoc.confidence_score !== null
                    ? `${Math.round(assoc.confidence_score * 100)}%`
                    : '-'}
                </td>
                <td className={styles.actionsCell}>
                  <button
                    className={styles.deleteButton}
                    onClick={() => setDeleteTarget(assoc)}
                    title="Delete association"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4h9.334z" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Association"
        message={`Remove the association to "${deleteTarget?.linked_service.name}"?`}
        confirmLabel="Delete"
        isDestructive
        isLoading={isDeleting}
      />
    </div>
  );
}

export default AssociationsList;
