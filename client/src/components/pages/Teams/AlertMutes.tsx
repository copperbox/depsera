import { useState, useEffect } from 'react';
import { useAlertMutes } from '../../../hooks/useAlertMutes';
import { formatRelativeTime } from '../../../utils/formatting';
import styles from './Teams.module.css';
import muteStyles from './AlertMutes.module.css';

interface AlertMutesProps {
  teamId: string;
  canManage: boolean;
}

const SCOPE_OPTIONS = [
  { value: 'instance', label: 'Specific dependency' },
  { value: 'canonical', label: 'Canonical name (all instances)' },
];

const DURATION_OPTIONS = [
  { value: '', label: 'No expiry (permanent)' },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '4h', label: '4 hours' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
];

function AlertMutes({ teamId, canManage }: AlertMutesProps) {
  const {
    mutes,
    isLoading,
    isCreating,
    error,
    loadMutes,
    handleCreate,
    handleDelete,
    clearError,
  } = useAlertMutes(teamId);

  const [scope, setScope] = useState<'instance' | 'canonical'>('instance');
  const [dependencyId, setDependencyId] = useState('');
  const [canonicalName, setCanonicalName] = useState('');
  const [duration, setDuration] = useState('');
  const [reason, setReason] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadMutes();
  }, [loadMutes]);

  const handleSubmit = async () => {
    const input = scope === 'instance'
      ? { dependency_id: dependencyId, duration: duration || undefined, reason: reason || undefined }
      : { canonical_name: canonicalName, duration: duration || undefined, reason: reason || undefined };

    const success = await handleCreate(input);
    if (success) {
      setDependencyId('');
      setCanonicalName('');
      setDuration('');
      setReason('');
      setShowForm(false);
    }
  };

  const handleConfirmDelete = async (muteId: string) => {
    await handleDelete(muteId);
    setConfirmDeleteId(null);
  };

  const isFormValid = scope === 'instance' ? dependencyId.trim() !== '' : canonicalName.trim() !== '';

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Alert Mutes</h2>
        {canManage && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className={muteStyles.addButton}
          >
            Add Mute
          </button>
        )}
      </div>

      {error && (
        <div className={muteStyles.error}>
          {error}
          <button onClick={clearError} style={{ marginLeft: '0.5rem', cursor: 'pointer', background: 'none', border: 'none', color: 'inherit' }}>
            &times;
          </button>
        </div>
      )}

      <div className={muteStyles.mutesContainer}>
        {showForm && canManage && (
          <div className={muteStyles.muteForm}>
            <div className={muteStyles.muteFormRow}>
              <div className={muteStyles.muteField}>
                <label className={muteStyles.muteLabel}>Scope</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as 'instance' | 'canonical')}
                  className={muteStyles.muteSelect}
                  disabled={isCreating}
                >
                  {SCOPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {scope === 'instance' ? (
                <div className={muteStyles.muteField}>
                  <label className={muteStyles.muteLabel}>Dependency ID</label>
                  <input
                    type="text"
                    value={dependencyId}
                    onChange={(e) => setDependencyId(e.target.value)}
                    className={muteStyles.muteInput}
                    placeholder="Dependency UUID"
                    disabled={isCreating}
                  />
                </div>
              ) : (
                <div className={muteStyles.muteField}>
                  <label className={muteStyles.muteLabel}>Canonical Name</label>
                  <input
                    type="text"
                    value={canonicalName}
                    onChange={(e) => setCanonicalName(e.target.value)}
                    className={muteStyles.muteInput}
                    placeholder="e.g. redis, postgresql"
                    disabled={isCreating}
                  />
                </div>
              )}
            </div>

            <div className={muteStyles.muteFormRow}>
              <div className={muteStyles.muteField}>
                <label className={muteStyles.muteLabel}>Duration</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className={muteStyles.muteSelect}
                  disabled={isCreating}
                >
                  {DURATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className={muteStyles.muteField}>
                <label className={muteStyles.muteLabel}>Reason (optional)</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className={muteStyles.muteInput}
                  placeholder="Maintenance, known flaky, etc."
                  maxLength={500}
                  disabled={isCreating}
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={isCreating || !isFormValid}
                className={muteStyles.addButton}
              >
                {isCreating ? 'Creating...' : 'Create Mute'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                disabled={isCreating}
                className={muteStyles.deleteButton}
                style={{ alignSelf: 'flex-end' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className={styles.loading} style={{ padding: '2rem' }}>
            <div className={styles.spinner} />
            <span>Loading mutes...</span>
          </div>
        ) : mutes.length === 0 ? (
          <div className={muteStyles.noMutes}>
            No active alert mutes for this team.
          </div>
        ) : (
          <table className={muteStyles.muteTable}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Target</th>
                <th>Reason</th>
                <th>Created By</th>
                <th>Expires</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {mutes.map((mute) => (
                <tr key={mute.id}>
                  <td>
                    <span className={muteStyles.muteType}>
                      {mute.dependency_id ? 'Instance' : 'Canonical'}
                    </span>
                  </td>
                  <td>
                    {mute.dependency_id
                      ? (mute.dependency_name || mute.dependency_id)
                      : mute.canonical_name}
                    {mute.service_name && (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                        ({mute.service_name})
                      </span>
                    )}
                  </td>
                  <td>{mute.reason || '-'}</td>
                  <td>{mute.created_by_name || mute.created_by}</td>
                  <td>
                    {mute.expires_at ? (
                      <span className={new Date(mute.expires_at) < new Date() ? muteStyles.expiredText : undefined}>
                        {formatRelativeTime(mute.expires_at)}
                      </span>
                    ) : (
                      'Never'
                    )}
                  </td>
                  {canManage && (
                    <td>
                      {confirmDeleteId === mute.id ? (
                        <>
                          <button
                            onClick={() => handleConfirmDelete(mute.id)}
                            className={muteStyles.deleteButton}
                            style={{ marginRight: '0.25rem' }}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(mute.id)}
                          className={muteStyles.deleteButton}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AlertMutes;
