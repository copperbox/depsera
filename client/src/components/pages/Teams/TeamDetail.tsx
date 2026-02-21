import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useTeamDetail, useTeamMembers } from '../../../hooks/useTeamDetail';
import Modal from '../../common/Modal';
import ConfirmDialog from '../../common/ConfirmDialog';
import TeamForm from './TeamForm';
import AlertChannels from './AlertChannels';
import styles from './Teams.module.css';

function TeamDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();

  const canManageAlerts = useMemo(() => {
    if (isAdmin) return true;
    if (!user?.teams || !id) return false;
    const membership = user.teams.find((t) => t.team_id === id);
    return membership?.role === 'lead';
  }, [isAdmin, user?.teams, id]);

  const {
    team,
    availableUsers,
    isLoading,
    error,
    isDeleting,
    loadTeam,
    handleDelete,
    setError,
  } = useTeamDetail(id, isAdmin);

  const {
    selectedUserId,
    setSelectedUserId,
    selectedRole,
    setSelectedRole,
    isAddingMember,
    addMemberError,
    actionInProgress,
    handleAddMember,
    handleToggleRole,
    handleRemoveMember,
  } = useTeamMembers(id, loadTeam, setError);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  /* istanbul ignore next -- @preserve
     handleEditSuccess is triggered by TeamForm onSuccess inside a Modal.
     Testing requires HTMLDialogElement mocking. Integration tests preferred. */
  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    loadTeam();
  };

  /* istanbul ignore next -- @preserve
     handleDeleteConfirm is triggered by ConfirmDialog onConfirm callback.
     Integration tests are more appropriate for testing dialog flows. */
  const handleDeleteConfirm = async () => {
    await handleDelete();
    setIsDeleteDialogOpen(false);
  };

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
                onChange={(e) => setSelectedRole(e.target.value as 'lead' | 'member')}
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

      {/* Alert Channels Section */}
      <AlertChannels teamId={id!} canManage={canManageAlerts} />

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
        onConfirm={handleDeleteConfirm}
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
