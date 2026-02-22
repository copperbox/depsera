import { useMemo } from 'react';
import type { UseSuggestionsReturn } from '../../../hooks/useSuggestions';
import { ASSOCIATION_TYPE_LABELS } from '../../../types/association';
import styles from './SuggestionsInbox.module.css';

interface SuggestionsInboxProps {
  suggestions: UseSuggestionsReturn;
}

function SuggestionsInbox({ suggestions }: SuggestionsInboxProps) {
  const {
    filtered,
    isLoading,
    error,
    selectedIds,
    serviceFilter,
    teamFilter,
    setServiceFilter,
    setTeamFilter,
    toggleSelected,
    selectAll,
    clearSelection,
    accept,
    dismiss,
    bulkAccept,
    bulkDismiss,
  } = suggestions;

  const serviceNames = useMemo(
    () => [...new Set(suggestions.suggestions.map((s) => s.service_name))].sort(),
    [suggestions.suggestions],
  );

  const linkedServiceNames = useMemo(
    () => [...new Set(suggestions.suggestions.map((s) => s.linked_service_name))].sort(),
    [suggestions.suggestions],
  );

  if (isLoading) {
    return <div className={styles.loading}>Loading suggestions...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  if (suggestions.suggestions.length === 0) {
    return <div className={styles.empty}>No pending suggestions.</div>;
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <select
            className={styles.filterSelect}
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            aria-label="Filter by source service"
          >
            <option value="">All source services</option>
            {serviceNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select
            className={styles.filterSelect}
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            aria-label="Filter by linked service"
          >
            <option value="">All linked services</option>
            {linkedServiceNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        {selectedIds.size > 0 && (
          <div className={styles.bulkActions}>
            <span className={styles.selectedCount}>{selectedIds.size} selected</span>
            <button className={styles.bulkAcceptButton} onClick={bulkAccept}>
              Accept Selected
            </button>
            <button className={styles.bulkDismissButton} onClick={bulkDismiss}>
              Dismiss Selected
            </button>
          </div>
        )}
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkboxCell}>
                <input
                  type="checkbox"
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={() =>
                    selectedIds.size === filtered.length ? clearSelection() : selectAll()
                  }
                  aria-label="Select all"
                />
              </th>
              <th>Dependency</th>
              <th>Source Service</th>
              <th>Linked Service</th>
              <th>Type</th>
              <th>Confidence</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td className={styles.checkboxCell}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onChange={() => toggleSelected(s.id)}
                    aria-label={`Select ${s.dependency_name}`}
                  />
                </td>
                <td className={styles.nameCell}>{s.dependency_name}</td>
                <td>{s.service_name}</td>
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
                    onClick={() => accept(s.id)}
                    title="Accept"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 8l3.5 3.5L13 5" />
                    </svg>
                  </button>
                  <button
                    className={styles.dismissButton}
                    onClick={() => dismiss(s.id)}
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
  );
}

export default SuggestionsInbox;
