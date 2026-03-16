import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useTeamDetail, useTeamMembers } from '../../../hooks/useTeamDetail';
import { useManifestConfigs } from '../../../hooks/useManifestConfigs';
import { parseContact } from '../../../utils/dependency';
import { formatRelativeTime } from '../../../utils/formatting';
import Modal from '../../common/Modal';
import ConfirmDialog from '../../common/ConfirmDialog';
import { Tabs, TabList, Tab, TabPanel } from '../../common/Tabs';
import TeamForm from './TeamForm';
import AlertChannels from './AlertChannels';
import AlertRules from './AlertRules';
import AlertHistory from './AlertHistory';
import AlertMutes from './AlertMutes';
import ApiKeys from './ApiKeys';
import OtlpStats from './OtlpStats';
import TeamOverviewStats from './TeamOverviewStats';
import ManifestList from '../Manifest/ManifestList';
import { useAlertChannels } from '../../../hooks/useAlertChannels';
import cardStyles from '../../common/SummaryCards.module.css';
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

  const { channels: alertChannels, loadChannels: loadAlertChannels } = useAlertChannels(id);

  const {
    configs: manifestConfigs,
    isLoading: manifestLoading,
    loadConfigs: loadManifestConfigs,
  } = useManifestConfigs(id);

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
    loadAlertChannels();
    loadManifestConfigs();
  }, [loadTeam, loadAlertChannels, loadManifestConfigs]);

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
        <ChevronLeft size={16} />
        Back to Teams
      </Link>

      {error && (
        <div className={styles.error} style={{ marginBottom: '1rem', padding: '0.75rem 1rem' }}>
          {error}
        </div>
      )}

      <Tabs defaultTab="overview" urlParam="tab" storageKey={`team-${id}-tab`}>
        <TabList aria-label="Team detail tabs">
          <Tab value="overview">Overview</Tab>
          <Tab value="members">
            Members ({team.members.length})
          </Tab>
          <Tab value="manifests">Manifests</Tab>
          <Tab value="services">
            Services ({team.services.length})
          </Tab>
          <Tab value="alerts">Alerts Config</Tab>
          {canManageAlerts && <Tab value="api-keys">API Keys</Tab>}
          {canManageAlerts && <Tab value="otlp-stats">OTLP</Tab>}
        </TabList>

        {/* Overview Tab */}
        <TabPanel value="overview">
          <div className={styles.overviewPanel}>
            <div className={styles.teamTitle}>
              <h1>{team.name}</h1>
            </div>
            {isAdmin && (
              <div className={styles.actions}>
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className={styles.ghostButton}
                >
                  <Pencil size={14} />
                  Edit
                </button>
                <button
                  onClick={() => setIsDeleteDialogOpen(true)}
                  className={styles.dangerButton}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            )}
          </div>
          <div className={styles.infoCardsGrid}>
            {team.key && (
              <div className={cardStyles.summaryCardAccent}>
                <span className={cardStyles.cardLabel}>Team Key</span>
                <code className={styles.infoCardCode}>{team.key}</code>
              </div>
            )}
            {team.description && (
              <div className={cardStyles.summaryCardAccent}>
                <span className={cardStyles.cardLabel}>Description</span>
                <span className={styles.infoCardText}>{team.description}</span>
              </div>
            )}
            {team.contact && (() => {
              const contactData = parseContact(team.contact);
              if (!contactData) return null;
              return (
                <div className={cardStyles.summaryCardAccent}>
                  <span className={cardStyles.cardLabel}>Contact</span>
                  <div className={styles.infoCardContact}>
                    {Object.entries(contactData).map(([label, value]) => (
                      <div key={label} className={styles.contactItem}>
                        <span className={styles.contactLabel}>{label}:</span>{' '}
                        <span className={styles.contactValue}>{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            {!manifestLoading && (() => {
              const enabledCount = manifestConfigs.filter(c => c.is_enabled).length;
              const hasAnyEnabled = enabledCount > 0;
              const mostRecentSync = manifestConfigs
                .filter(c => c.last_sync_at)
                .sort((a, b) => new Date(b.last_sync_at!).getTime() - new Date(a.last_sync_at!).getTime())[0];
              const hasFailure = manifestConfigs.some(c => c.last_sync_status === 'failed');

              return (
                <div className={manifestConfigs.length > 0
                  ? (hasAnyEnabled
                    ? cardStyles.summaryCardHealthy
                    : cardStyles.summaryCardWarning)
                  : cardStyles.summaryCardAccent
                }>
                  <span className={cardStyles.cardLabel}>Manifest Sync</span>
                  {manifestConfigs.length > 0 ? (
                    <>
                      <span className={styles.infoCardText}>
                        {manifestConfigs.length} manifest{manifestConfigs.length !== 1 ? 's' : ''}, {enabledCount} enabled
                      </span>
                      {mostRecentSync ? (
                        <span className={cardStyles.cardSubtext}>
                          Last sync: {formatRelativeTime(mostRecentSync.last_sync_at!)}
                          {hasFailure && ' (has failures)'}
                        </span>
                      ) : (
                        <span className={cardStyles.cardSubtext}>No syncs yet</span>
                      )}
                    </>
                  ) : (
                    <span className={styles.infoCardText}>Not configured</span>
                  )}
                </div>
              );
            })()}
          </div>
          <TeamOverviewStats
            teamId={id!}
            members={team.members}
            services={team.services}
          />
        </TabPanel>

        {/* Members Tab */}
        <TabPanel value="members">
          {isAdmin && availableUsers.length > 0 && (
            <div className={styles.addMemberForm}>
              <div className={styles.field}>
                <label className={styles.label}>User</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className={styles.select}
                  disabled={isAddingMember}
                >
                  <option value="">Select a user...</option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
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
        </TabPanel>

        {/* Manifests Tab */}
        <TabPanel value="manifests">
          <ManifestList teamId={id!} canManage={canManageAlerts} />
        </TabPanel>

        {/* Services Tab */}
        <TabPanel value="services">
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
                    {service.manifest_managed === 1 && (
                      <span className={styles.manifestBadge} title="Managed by manifest">M</span>
                    )}
                    {!service.is_active && (
                      <span className={styles.inactiveBadge}>
                        Inactive
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabPanel>

        {/* Alerts Config Tab */}
        <TabPanel value="alerts">
          <div className={styles.alertsPanel}>
            <div className={styles.alertCard}>
              <AlertChannels teamId={id!} canManage={canManageAlerts} />
            </div>
            <div className={styles.alertCard}>
              <AlertRules teamId={id!} canManage={canManageAlerts} />
            </div>
            <div className={styles.alertCard}>
              <AlertMutes teamId={id!} canManage={canManageAlerts} />
            </div>
            <div className={styles.alertCard}>
              <AlertHistory teamId={id!} channels={alertChannels} />
            </div>
          </div>
        </TabPanel>

        {/* API Keys Tab */}
        {canManageAlerts && (
          <TabPanel value="api-keys">
            <ApiKeys teamId={id!} canManage={canManageAlerts} />
          </TabPanel>
        )}

        {canManageAlerts && (
          <TabPanel value="otlp-stats">
            <OtlpStats teamId={id!} />
          </TabPanel>
        )}
      </Tabs>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Team"
        size="md"
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
