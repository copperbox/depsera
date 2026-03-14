import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useManifestConfig } from '../../../hooks/useManifestConfig';
import { fetchTeam } from '../../../api/teams';
import ManifestConfig from './ManifestConfig';
import ManifestSyncResult from './ManifestSyncResult';
import DriftReview from './DriftReview';
import SyncHistory from './SyncHistory';
import ServiceKeyLookup from './ServiceKeyLookup';
import ManifestList from './ManifestList';
import styles from './ManifestPage.module.css';

function ManifestPage() {
  const { id, configId } = useParams<{ id: string; configId?: string }>();
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
  } = useManifestConfig(id, configId);

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
    if (configId) {
      loadConfig();
    }
  }, [loadConfig, configId]);

  if (teamLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Loader2 size={24} className={styles.spinner} />
          <span>Loading...</span>
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

  // No configId → show list view
  if (!configId) {
    return (
      <div className={styles.container}>
        <Link to={`/teams/${id}`} className={styles.backLink}>
          <ChevronLeft size={16} />
          Back to {teamName || 'Team'}
        </Link>

        <ManifestList teamId={id!} canManage={canManage} />
      </div>
    );
  }

  // Detail view for a specific config
  if (configLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Loader2 size={24} className={styles.spinner} />
          <span>Loading manifest configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link to={`/teams/${id}/manifest`} className={styles.backLink}>
        <ChevronLeft size={16} />
        Back to Manifests
      </Link>

      <h1 className={styles.pageTitle}>
        {config?.name || 'Manifest Configuration'}
      </h1>

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

      {!config && (
        <div className={styles.error}>
          <p>Manifest config not found.</p>
          <Link to={`/teams/${id}/manifest`} className={styles.retryButton}>
            Back to Manifests
          </Link>
        </div>
      )}

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

          {/* Service Key Lookup */}
          <ServiceKeyLookup />

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

          {/* Drift Review Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Drift Review</h2>
            </div>
            <DriftReview teamId={id!} canManage={canManage} />
          </div>

          {/* Sync History Section */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Sync History</h2>
            </div>
            <SyncHistory teamId={id!} configId={configId} />
          </div>
        </>
      )}
    </div>
  );
}

export default ManifestPage;
