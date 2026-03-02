import { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchTeams } from '../../../api/teams';
import {
  fetchExternalServices,
  createExternalService,
  updateExternalService,
  deleteExternalService,
} from '../../../api/external-services';
import type { ExternalService } from '../../../types/external-service';
import type { TeamWithCounts } from '../../../types/service';
import { formatDate } from '../../../utils/formatting';
import styles from './ExternalServicesManager.module.css';

function ExternalServicesManager() {
  const { canManageServices } = useAuth();
  const [services, setServices] = useState<ExternalService[]>([]);
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const loadData = async () => {
    try {
      const [svcData, teamData] = await Promise.all([
        fetchExternalServices(),
        fetchTeams(),
      ]);
      setServices(svcData);
      setTeams(teamData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !teamId) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const created = await createExternalService({
        name: name.trim(),
        team_id: teamId,
        description: description.trim() || undefined,
      });
      setServices((prev) => [...prev, created]);
      setName('');
      setDescription('');
      setTeamId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create external service');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (svc: ExternalService) => {
    setEditingId(svc.id);
    setEditName(svc.name);
    setEditDescription(svc.description || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim()) return;

    setIsUpdating(true);
    setError(null);
    try {
      const updated = await updateExternalService(editingId, {
        name: editName.trim(),
        description: editDescription.trim() || null,
      });
      setServices((prev) =>
        prev.map((s) => (s.id === editingId ? updated : s)),
      );
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update external service');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await deleteExternalService(id);
      setServices((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete external service');
    }
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <div className={styles.container}>
      <p className={styles.description}>
        External services represent dependencies outside of Depsera&apos;s monitoring scope.
        They can be used as association targets without requiring a health endpoint.
      </p>

      {canManageServices && (
        <form className={styles.form} onSubmit={handleCreate}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="ext-name">
              Name
            </label>
            <input
              id="ext-name"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. External Payment API"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="ext-desc">
              Description
            </label>
            <input
              id="ext-desc"
              className={styles.input}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="ext-team">
              Team
            </label>
            <select
              id="ext-team"
              className={styles.select}
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              <option value="">Select team...</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className={styles.addButton}
            disabled={isSubmitting || !name.trim() || !teamId}
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </button>
        </form>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {services.length === 0 ? (
        <div className={styles.empty}>
          No external services yet.{' '}
          {canManageServices
            ? 'Create one above to use as an association target.'
            : ''}
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Team</th>
                <th>Created</th>
                {canManageServices && <th></th>}
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => (
                <tr key={svc.id}>
                  {editingId === svc.id ? (
                    <>
                      <td>
                        <input
                          className={styles.editInput}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.editInput}
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Optional"
                        />
                      </td>
                      <td>{svc.team.name}</td>
                      <td>{formatDate(svc.created_at)}</td>
                      <td className={styles.actionsCell}>
                        <button
                          className={styles.saveButton}
                          onClick={handleUpdate}
                          disabled={isUpdating || !editName.trim()}
                        >
                          {isUpdating ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          className={styles.cancelButton}
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={styles.nameCell}>{svc.name}</td>
                      <td className={styles.descCell}>
                        {svc.description || (
                          <span className={styles.muted}>-</span>
                        )}
                      </td>
                      <td>{svc.team.name}</td>
                      <td>{formatDate(svc.created_at)}</td>
                      {canManageServices && (
                        <td className={styles.actionsCell}>
                          <button
                            className={styles.iconButton}
                            onClick={() => startEdit(svc)}
                            title="Edit"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11.333 2A1.886 1.886 0 0 1 14 4.667l-9 9-3.667 1L3.333 11l9-9z" />
                            </svg>
                          </button>
                          <button
                            className={`${styles.iconButton} ${styles.deleteButton}`}
                            onClick={() => handleDelete(svc.id)}
                            title="Delete"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4h9.334z" />
                            </svg>
                          </button>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ExternalServicesManager;
