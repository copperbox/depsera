import { useState, useEffect, useMemo } from 'react';
import { useDriftFlags } from '../../../hooks/useDriftFlags';
import ConfirmDialog from '../../common/ConfirmDialog';
import DriftFlagCard from './DriftFlagCard';
import styles from './DriftReview.module.css';

interface DriftReviewProps {
  teamId: string;
  canManage: boolean;
}

function DriftReview({ teamId, canManage }: DriftReviewProps) {
  const {
    filtered,
    summary,
    isLoading,
    error,
    view,
    setView,
    typeFilter,
    setTypeFilter,
    serviceFilter,
    setServiceFilter,
    selectedIds,
    toggleSelected,
    selectAll,
    clearSelection,
    loadFlags,
    accept,
    dismiss,
    reopen,
    bulkAccept,
    bulkDismiss,
    clearError,
  } = useDriftFlags(teamId);

  const [bulkConfirmType, setBulkConfirmType] = useState<'accept' | 'dismiss' | null>(null);
  const [bulkInProgress, setBulkInProgress] = useState(false);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  // Unique service names for filter dropdown
  const serviceOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const f of filtered) {
      if (!seen.has(f.service_id)) {
        seen.set(f.service_id, f.service_name);
      }
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [filtered]);

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  const handleSelectAll = () => {
    if (allSelected) {
      clearSelection();
    } else {
      selectAll();
    }
  };

  const handleBulkAccept = () => {
    setBulkConfirmType('accept');
  };

  const handleBulkDismiss = () => {
    setBulkConfirmType('dismiss');
  };

  const handleBulkConfirm = async () => {
    setBulkInProgress(true);
    try {
      if (bulkConfirmType === 'accept') {
        await bulkAccept();
      } else {
        await bulkDismiss();
      }
    } finally {
      setBulkInProgress(false);
      setBulkConfirmType(null);
    }
  };

  const handleBulkCancel = () => {
    setBulkConfirmType(null);
  };

  const pendingCount = summary?.pending_count ?? 0;
  const dismissedCount = summary?.dismissed_count ?? 0;

  return (
    <div>
      {/* Sub-navigation toggle */}
      <div className={styles.viewToggle}>
        <button
          className={`${styles.viewButton} ${view === 'pending' ? styles.viewButtonActive : ''}`}
          onClick={() => setView('pending')}
        >
          Pending
          <span className={styles.viewCount}>{`(${pendingCount})`}</span>
        </button>
        <button
          className={`${styles.viewButton} ${view === 'dismissed' ? styles.viewButtonActive : ''}`}
          onClick={() => setView('dismissed')}
        >
          Dismissed
          <span className={styles.viewCount}>{`(${dismissedCount})`}</span>
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className={styles.error}>
          {error}
          <button
            onClick={clearError}
            style={{ marginLeft: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 600 }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && <div className={styles.loading}>Loading drift flags...</div>}

      {/* Content */}
      {!isLoading && !error && (
        <>
          {/* Toolbar */}
          {filtered.length > 0 && (
            <div className={styles.toolbar}>
              <div className={styles.filters}>
                <select
                  className={styles.filterSelect}
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                  aria-label="Filter by type"
                >
                  <option value="">All types</option>
                  <option value="field_change">Field changes</option>
                  <option value="service_removal">Service removals</option>
                </select>
                {serviceOptions.length > 1 && (
                  <select
                    className={styles.filterSelect}
                    value={serviceFilter}
                    onChange={(e) => setServiceFilter(e.target.value)}
                    aria-label="Filter by service"
                  >
                    <option value="">All services</option>
                    {serviceOptions.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {canManage && selectedIds.size > 0 && (
                <div className={styles.bulkActions}>
                  <span className={styles.selectedCount}>
                    {selectedIds.size} selected
                  </span>
                  {view === 'pending' && (
                    <>
                      <button
                        className={`${styles.bulkButton} ${styles.bulkAccept}`}
                        onClick={handleBulkAccept}
                      >
                        Accept All
                      </button>
                      <button
                        className={`${styles.bulkButton} ${styles.bulkDismiss}`}
                        onClick={handleBulkDismiss}
                      >
                        Dismiss All
                      </button>
                    </>
                  )}
                  {view === 'dismissed' && (
                    <button
                      className={`${styles.bulkButton} ${styles.bulkAccept}`}
                      onClick={handleBulkAccept}
                    >
                      Accept All
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Select all row */}
          {canManage && filtered.length > 0 && (
            <div className={styles.selectAllRow}>
              <label>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleSelectAll}
                />
                {' '}Select all ({filtered.length})
              </label>
            </div>
          )}

          {/* Flag cards */}
          {filtered.length > 0 ? (
            <div className={styles.flagsList}>
              {filtered.map((flag) => (
                <DriftFlagCard
                  key={flag.id}
                  flag={flag}
                  isSelected={selectedIds.has(flag.id)}
                  canManage={canManage}
                  onToggleSelect={toggleSelected}
                  onAccept={accept}
                  onDismiss={dismiss}
                  onReopen={reopen}
                />
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              {view === 'pending'
                ? 'No pending drift flags. All services match their manifest definitions.'
                : 'No dismissed drift flags.'}
            </div>
          )}
        </>
      )}

      {/* Bulk action confirmation dialog */}
      <ConfirmDialog
        isOpen={bulkConfirmType !== null}
        onClose={handleBulkCancel}
        onConfirm={handleBulkConfirm}
        title={bulkConfirmType === 'accept' ? 'Accept Selected Flags' : 'Dismiss Selected Flags'}
        message={
          bulkConfirmType === 'accept'
            ? `Accept ${selectedIds.size} selected drift flag${selectedIds.size === 1 ? '' : 's'}? Accepted field changes will update current values. Accepted service removals will deactivate those services.`
            : `Dismiss ${selectedIds.size} selected drift flag${selectedIds.size === 1 ? '' : 's'}? Dismissed flags can be re-opened later.`
        }
        confirmLabel={bulkConfirmType === 'accept' ? 'Accept' : 'Dismiss'}
        isDestructive={bulkConfirmType === 'accept'}
        isLoading={bulkInProgress}
      />
    </div>
  );
}

export default DriftReview;
