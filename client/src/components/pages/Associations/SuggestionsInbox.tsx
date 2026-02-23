import { useMemo } from 'react';
import type { UseSuggestionsReturn } from '../../../hooks/useSuggestions';
import { ASSOCIATION_TYPE_LABELS } from '../../../types/association';
import styles from './SuggestionsInbox.module.css';

interface SuggestionsInboxProps {
  suggestions: UseSuggestionsReturn;
}

function getConfidenceLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
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

      <div className={styles.toolbar}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
          <input
            type="checkbox"
            checked={selectedIds.size === filtered.length && filtered.length > 0}
            onChange={() =>
              selectedIds.size === filtered.length ? clearSelection() : selectAll()
            }
            aria-label="Select all"
          />
          Select all
        </label>
      </div>

      <div className={styles.cardGrid}>
        {filtered.map((s) => {
          const level = s.confidence_score !== null ? getConfidenceLevel(s.confidence_score) : null;
          const isSelected = selectedIds.has(s.id);

          return (
            <div
              key={s.id}
              className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
            >
              <div className={styles.cardTop}>
                <input
                  type="checkbox"
                  className={styles.cardCheckbox}
                  checked={isSelected}
                  onChange={() => toggleSelected(s.id)}
                  aria-label={`Select ${s.dependency_name}`}
                />
                <div className={styles.cardContent}>
                  <div className={styles.depName}>{s.dependency_name}</div>
                  <div className={styles.serviceFlow}>
                    <span className={styles.serviceName}>{s.service_name}</span>
                    <span className={styles.arrow}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 8h10M9 4l4 4-4 4" />
                      </svg>
                    </span>
                    <span className={styles.serviceName}>{s.linked_service_name}</span>
                  </div>
                  <div className={styles.cardMeta}>
                    <span className={styles.typeBadge}>
                      {ASSOCIATION_TYPE_LABELS[s.association_type]}
                    </span>
                    {s.confidence_score !== null && level && (
                      <div className={styles.confidenceWrapper}>
                        <div className={styles.confidenceBar}>
                          <div
                            className={`${styles.confidenceFill} ${
                              level === 'high'
                                ? styles.confidenceHigh
                                : level === 'medium'
                                  ? styles.confidenceMedium
                                  : styles.confidenceLow
                            }`}
                            style={{ width: `${Math.round(s.confidence_score)}%` }}
                          />
                        </div>
                        <span className={styles.confidenceLabel}>
                          {Math.round(s.confidence_score)}%
                        </span>
                      </div>
                    )}
                    {s.confidence_score === null && (
                      <span className={styles.confidenceLabel}>-</span>
                    )}
                    {s.match_reason && (
                      <span className={styles.matchReason}>{s.match_reason}</span>
                    )}
                  </div>
                </div>
                <div className={styles.cardActions}>
                  <button
                    className={styles.acceptButton}
                    onClick={() => accept(s.id)}
                    title="Accept"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 8l3.5 3.5L13 5" />
                    </svg>
                    Accept
                  </button>
                  <button
                    className={styles.dismissButton}
                    onClick={() => dismiss(s.id)}
                    title="Dismiss"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SuggestionsInbox;
