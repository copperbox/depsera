import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchService, fetchTeams, deleteService } from '../../../api/services';
import type { ServiceWithDependencies, TeamWithCounts, Dependency } from '../../../types/service';
import StatusBadge, { type BadgeStatus } from '../../common/StatusBadge';
import Modal from '../../common/Modal';
import ConfirmDialog from '../../common/ConfirmDialog';
import ServiceForm from './ServiceForm';
import styles from './Services.module.css';

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function getHealthBadgeStatus(status: string): BadgeStatus {
  switch (status) {
    case 'healthy':
      return 'healthy';
    case 'degraded':
      return 'warning';
    case 'unhealthy':
      return 'critical';
    default:
      return 'unknown';
  }
}

function getDependencyBadgeStatus(dep: Dependency): BadgeStatus {
  if (dep.healthy === null && dep.health_state === null) {
    return 'unknown';
  }
  if (dep.healthy === 0 || dep.health_state === 2) {
    return 'critical';
  }
  if (dep.health_state === 1) {
    return 'warning';
  }
  return 'healthy';
}

function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [service, setService] = useState<ServiceWithDependencies | null>(null);
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const loadService = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [serviceData, teamsData] = await Promise.all([
        fetchService(id),
        fetchTeams(),
      ]);
      setService(serviceData);
      setTeams(teamsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load service');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadService();
  }, [loadService]);

  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    loadService();
  };

  const handleDelete = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteService(id);
      navigate('/services');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete service');
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePoll = async () => {
    if (!id) return;
    setIsPolling(true);
    try {
      const serviceData = await fetchService(id);
      setService(serviceData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh service');
    } finally {
      setIsPolling(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading service...</span>
        </div>
      </div>
    );
  }

  if (error && !service) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>{error}</p>
          <button onClick={loadService} className={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>Service not found</p>
          <Link to="/services" className={styles.retryButton}>
            Back to Services
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link to="/services" className={styles.backLink}>
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
        Back to Services
      </Link>

      {error && (
        <div className={styles.error} style={{ marginBottom: '1rem', padding: '0.75rem 1rem' }}>
          {error}
        </div>
      )}

      <div className={styles.detailHeader}>
        <div className={styles.serviceTitle}>
          <h1>{service.name}</h1>
          <StatusBadge status={getHealthBadgeStatus(service.health.status)} />
          {!service.is_active && <span className={styles.inactiveBadge}>Inactive</span>}
        </div>
        <div className={styles.actions}>
          <button
            onClick={handlePoll}
            disabled={isPolling}
            className={`${styles.actionButton} ${styles.pollButton}`}
          >
            {isPolling ? (
              <>
                <div className={styles.spinner} style={{ width: '1rem', height: '1rem', borderWidth: '2px' }} />
                Refreshing...
              </>
            ) : (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 8A6 6 0 1 1 8 2" />
                  <path d="M8 2V5L10 3" />
                </svg>
                Refresh
              </>
            )}
          </button>
          {isAdmin && (
            <>
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
            </>
          )}
        </div>
      </div>

      <div className={styles.metadataCard}>
        <div className={styles.metadataGrid}>
          <div className={styles.metadataItem}>
            <span className={styles.metadataLabel}>Team</span>
            <span className={styles.metadataValue}>{service.team.name}</span>
          </div>
          <div className={styles.metadataItem}>
            <span className={styles.metadataLabel}>Health Endpoint</span>
            <span className={styles.metadataValue}>
              <a href={service.health_endpoint} target="_blank" rel="noopener noreferrer">
                {service.health_endpoint}
              </a>
            </span>
          </div>
          {service.metrics_endpoint && (
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>Metrics Endpoint</span>
              <span className={styles.metadataValue}>
                <a href={service.metrics_endpoint} target="_blank" rel="noopener noreferrer">
                  {service.metrics_endpoint}
                </a>
              </span>
            </div>
          )}
          <div className={styles.metadataItem}>
            <span className={styles.metadataLabel}>Polling Interval</span>
            <span className={styles.metadataValue}>{service.polling_interval}s</span>
          </div>
          <div className={styles.metadataItem}>
            <span className={styles.metadataLabel}>Last Updated</span>
            <span className={styles.metadataValue}>{formatRelativeTime(service.updated_at)}</span>
          </div>
        </div>
      </div>

      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Dependencies</h2>
        <span className={styles.sectionSubtitle}>
          {service.health.healthy_count}/{service.health.total_dependencies} healthy
        </span>
      </div>

      {service.dependencies.length === 0 ? (
        <div className={styles.noDeps}>
          <p>No dependencies registered for this service.</p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Impact</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Last Checked</th>
              </tr>
            </thead>
            <tbody>
              {service.dependencies.map((dep) => (
                <tr key={dep.id} className={styles.dependencyRow}>
                  <td>{dep.name}</td>
                  <td className={styles.teamCell}>{dep.description || '-'}</td>
                  <td className={styles.impactCell}>
                    <span className={styles.impactText} title={dep.impact || undefined}>
                      {dep.impact || '-'}
                    </span>
                  </td>
                  <td>
                    <StatusBadge
                      status={getDependencyBadgeStatus(dep)}
                      size="small"
                      showLabel={true}
                    />
                  </td>
                  <td className={styles.latencyCell}>
                    {dep.latency_ms !== null ? `${dep.latency_ms}ms` : '-'}
                  </td>
                  <td className={styles.timeCell}>
                    {formatRelativeTime(dep.last_checked)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Service"
        size="medium"
      >
        <ServiceForm
          teams={teams}
          service={service}
          onSuccess={handleEditSuccess}
          onCancel={() => setIsEditModalOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Delete Service"
        message={`Are you sure you want to delete "${service.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isDestructive
        isLoading={isDeleting}
      />
    </div>
  );
}

export default ServiceDetail;
