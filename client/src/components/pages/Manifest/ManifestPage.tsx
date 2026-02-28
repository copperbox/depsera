import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useManifestConfig } from '../../../hooks/useManifestConfig';
import { fetchTeam } from '../../../api/teams';
import ManifestConfig from './ManifestConfig';
import ManifestSyncResult from './ManifestSyncResult';
import SyncHistory from './SyncHistory';
import styles from './ManifestPage.module.css';

function ManifestPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();

  const [teamName, setTeamName] = useState<string | null>(null);
  const [teamLoading, setTeamLoading] = useState(true);
  const [teamError, setTeamError] = useState<string | null>(null);

  const canManage = useMemo(() => {
    if (isAdmin) return true;
    if (!user?.teams || !id) return false;
    const membership = user.teams.find((t) => t.team_id === id);
    return membership?.role === 'lead';
  }, [isAdmin, user?.teams, id]);

  const {
    config,
    isLoading: configLoading,
    error: configError,
    isSaving,
    isSyncing,
    syncResult,
    loadConfig,
    saveConfig,
    removeConfig,
    toggleEnabled,
    triggerSync,
    clearError,
    clearSyncResult,
  } = useManifestConfig(id);

  // Fetch team name for the back link
  useEffect(() => {
    if (!id) return;
    setTeamLoading(true);
    fetchTeam(id)
      .then((team) => {
        setTeamName(team.name);
        setTeamError(null);
      })
      .catch(() => {
        setTeamError('Failed to load team');
      })
      .finally(() => {
        setTeamLoading(false);
      });
  }, [id]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const isLoading = teamLoading || configLoading;

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading manifest configuration...</span>
        </div>
      </div>
    );
  }

  if (teamError) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{teamError}</p>
          <Link to="/teams" className={styles.retryButton}>
            Back to Teams
          </Link>
        </div>
      </div>
    );
  }

  const handleConfigureClick = () => {
    // Start with empty config — save will create it
    saveConfig({ manifest_url: '' });
  };

  return (
    <div className={styles.container}>
      <Link to={`/teams/${id}`} className={styles.backLink}>
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
        Back to {teamName || 'Team'}
      </Link>

      <h1 className={styles.pageTitle}>Manifest Configuration</h1>

      {configError && (
        <div className={styles.errorBanner}>
          {configError}
          <button
            onClick={clearError}
            style={{ marginLeft: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 600 }}
          >
            &times;
          </button>
        </div>
      )}

      {/* No manifest configured — empty state */}
      {!config && (
        <div className={styles.emptyState}>
          <p>
            No manifest configured for this team. A manifest lets you declaratively define services, aliases,
            and associations using a JSON file. Changes are automatically synced and manual edits are detected as drift.
          </p>
          {canManage && (
            <button className={styles.configureButton} onClick={handleConfigureClick}>
              Configure Manifest
            </button>
          )}
        </div>
      )}

      {/* Configuration Section */}
      {config && (
        <>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Configuration</h2>
            </div>
            <ManifestConfig
              config={config}
              canManage={canManage}
              isSaving={isSaving}
              onSave={saveConfig}
              onRemove={removeConfig}
              onToggleEnabled={toggleEnabled}
            />
          </div>

          {/* Last Sync Result Section */}
          <div className={styles.section}>
            <ManifestSyncResult
              config={config}
              isSyncing={isSyncing}
              syncResult={syncResult}
              onSync={triggerSync}
              onClearSyncResult={clearSyncResult}
            />
          </div>

          {/* Drift Review Section — placeholder for DPS-63 */}

          {/* Sync History Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Sync History</h2>
            </div>
            <SyncHistory teamId={id!} />
          </div>
        </>
      )}
    </div>
  );
}

export default ManifestPage;
