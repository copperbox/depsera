import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import {
  fetchTeam,
  deleteTeam,
  fetchUsers,
  addTeamMember,
  updateTeamMember,
  removeTeamMember,
} from '../../../api/teams';
import type { TeamWithDetails, TeamMember, TeamMemberRole } from '../../../types/team';
import type { User } from '../../../types/user';
import Modal from '../../common/Modal';
import ConfirmDialog from '../../common/ConfirmDialog';
import TeamForm from './TeamForm';
import styles from './Teams.module.css';

function TeamDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [team, setTeam] = useState<TeamWithDetails | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Add member form state
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<TeamMemberRole>('member');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  // Member action state
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [teamData, usersData] = await Promise.all([
        fetchTeam(id),
        isAdmin ? fetchUsers() : Promise.resolve([]),
      ]);
      setTeam(teamData);
      setUsers(usersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team');
    } finally {
      setIsLoading(false);
    }
  }, [id, isAdmin]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    loadTeam();
  };

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteTeam(id);
      navigate('/teams');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team');
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddMember = async () => {
    if (!id || !selectedUserId) return;
    setIsAddingMember(true);
    setAddMemberError(null);
    try {
      await addTeamMember(id, { user_id: selectedUserId, role: selectedRole });
      setSelectedUserId('');
      setSelectedRole('member');
      loadTeam();
    } catch (err) {
      setAddMemberError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleToggleRole = async (member: TeamMember) => {
    if (!id) return;
    const newRole: TeamMemberRole = member.role === 'lead' ? 'member' : 'lead';
    setActionInProgress(member.user_id);
    try {
      await updateTeamMember(id, member.user_id, { role: newRole });
      loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!id) return;
    setActionInProgress(userId);
    try {
      await removeTeamMember(id, userId);
      loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setActionInProgress(null);
    }
  };

  // Get users that are not already members
  const availableUsers = users.filter(
    (user) => !team?.members.some((member) => member.user_id === user.id)
  );

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading team...</span>
        </div>
      </div>
    );
  }

  if (error && !team) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={loadTeam} className={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>Team not found</p>
          <Link to="/teams" className={styles.retryButton}>
            Back to Teams
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link to="/teams" className={styles.backLink}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M10 12L6 8l4-4" />
        </svg>
        Back to Teams
      </Link>

      {error && (
        <div className={styles.error} style={{ marginBottom: '1rem', padding: '0.75rem 1rem' }}>
          {error}
        </div>
      )}

      <div className={styles.detailHeader}>
        <div className={styles.teamTitle}>
          <h1>{team.name}</h1>
          {team.description && (
            <p className={styles.teamDescription}>{team.description}</p>
          )}
        </div>
        {isAdmin && (
          <div className={styles.actions}>
            <button
              onClick={() => setIsEditModalOpen(true)}
              className={`${styles.actionButton} ${styles.editButton}`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M11.5 2.5a2.121 2.121 0 0 1 3 3L5 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
            <button
              onClick={() => setIsDeleteDialogOpen(true)}
              className={`${styles.actionButton} ${styles.deleteButton}`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4h9.334z" />
              </svg>
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Members Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Members</h2>
          <span className={styles.sectionSubtitle}>
            {team.members.length} {team.members.length === 1 ? 'member' : 'members'}
          </span>
        </div>

        {isAdmin && availableUsers.length > 0 && (
          <div className={styles.addMemberForm} style={{ marginBottom: '1rem' }}>
            <div className={styles.field}>
              <label className={styles.label}>User</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className={styles.select}
                disabled={isAddingMember}
              >
                <option value="">Select a user...</option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field} style={{ maxWidth: '8rem' }}>
              <label className={styles.label}>Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as TeamMemberRole)}
                className={styles.select}
                disabled={isAddingMember}
              >
                <option value="member">Member</option>
                <option value="lead">Lead</option>
              </select>
            </div>
            <button
              onClick={handleAddMember}
              disabled={!selectedUserId || isAddingMember}
              className={styles.addMemberButton}
            >
              {isAddingMember ? 'Adding...' : 'Add Member'}
            </button>
          </div>
        )}

        {addMemberError && (
          <div className={styles.error} style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
            {addMemberError}
          </div>
        )}

        {team.members.length === 0 ? (
          <div className={styles.noItems}>
            <p>No members in this team yet.</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {team.members.map((member) => (
                  <tr key={member.user_id} className={styles.memberRow}>
                    <td>{member.user.name}</td>
                    <td className={styles.emailCell}>{member.user.email}</td>
                    <td>
                      <span
                        className={`${styles.roleBadge} ${
                          member.role === 'lead' ? styles.roleLead : styles.roleMember
                        }`}
                      >
                        {member.role === 'lead' ? 'Lead' : 'Member'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <div className={styles.memberActions}>
                          <button
                            onClick={() => handleToggleRole(member)}
                            disabled={actionInProgress === member.user_id}
                            className={`${styles.smallButton} ${styles.roleButton}`}
                          >
                            {member.role === 'lead' ? 'Demote' : 'Promote'}
                          </button>
                          <button
                            onClick={() => handleRemoveMember(member.user_id)}
                            disabled={actionInProgress === member.user_id}
                            className={`${styles.smallButton} ${styles.removeButton}`}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Services Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Services</h2>
          <span className={styles.sectionSubtitle}>
            {team.services.length} {team.services.length === 1 ? 'service' : 'services'}
          </span>
        </div>

        {team.services.length === 0 ? (
          <div className={styles.noItems}>
            <p>No services assigned to this team yet.</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            {team.services.map((service) => (
              <div key={service.id} className={styles.serviceItem}>
                <div className={styles.serviceInfo}>
                  <Link to={`/services/${service.id}`} className={styles.serviceName}>
                    {service.name}
                  </Link>
                  {!service.is_active && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: '#6b7280',
                        backgroundColor: '#f3f4f6',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '9999px',
                      }}
                    >
                      Inactive
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Team"
        size="medium"
      >
        <TeamForm
          team={team}
          onSuccess={handleEditSuccess}
          onCancel={() => setIsEditModalOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Delete Team"
        message={`Are you sure you want to delete "${team.name}"? This will remove all team memberships. Services owned by this team will need to be reassigned.`}
        confirmLabel="Delete"
        isDestructive
        isLoading={isDeleting}
      />
    </div>
  );
}

export default TeamDetail;
