import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useServiceDetail } from '../../../hooks/useServiceDetail';
import StatusBadge from '../../common/StatusBadge';
import Modal from '../../common/Modal';
import ConfirmDialog from '../../common/ConfirmDialog';
import ServiceForm from './ServiceForm';
import DependencyList from './DependencyList';
import PollIssuesSection from './PollIssuesSection';
import { formatRelativeTime } from '../../../utils/formatting';
import { getHealthBadgeStatus, getHealthStateBadgeStatus } from '../../../utils/statusMapping';
import styles from './Services.module.css';

function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();

  const {
    service,
    teams,
    isLoading,
    error,
    isDeleting,
    isPolling,
    loadService,
    handleDelete,
    handlePoll,
  } = useServiceDetail(id);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  /**
   * Check if the current user can edit overrides for this service.
   * Admin or team lead of the service's owning team.
   */
  const canEditOverrides = useCallback((): boolean => {
    if (isAdmin) return true;
    if (!user || !service) return false;
    const membership = user.teams?.find(t => t.team_id === service.team_id);
    return membership?.role === 'lead';
  }, [isAdmin, user, service]);

  useEffect(() => {
    loadService();
  }, [loadService]);

  /* istanbul ignore next -- @preserve
     handleEditSuccess is triggered by ServiceForm onSuccess inside a Modal. Testing this
     requires mocking HTMLDialogElement.showModal/close and form submission flows.
     Integration tests with Cypress/Playwright are more appropriate. */
  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    loadService();
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
          <Link
            to={`/graph?isolateService=${id}`}
            className={`${styles.actionButton} ${styles.graphLink}`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
            View in Graph
          </Link>
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
          {service.last_poll_success === 0 && (
            <div className={styles.metadataItem}>
              <span className={styles.metadataLabel}>Poll Status</span>
              <span className={styles.metadataValue} style={{ color: 'var(--color-error, #dc3545)' }}>
                Failed: {service.last_poll_error || 'Unknown error'}
              </span>
            </div>
          )}
          <div className={styles.metadataItem}>
            <span className={styles.metadataLabel}>Last Updated</span>
            <span className={styles.metadataValue}>{formatRelativeTime(service.updated_at)}</span>
          </div>
        </div>
      </div>

      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Dependent Reports</h2>
        <span className={styles.sectionSubtitle}>
          {service.health.healthy_reports}/{service.health.total_reports} healthy reports from {service.health.dependent_count} service{service.health.dependent_count !== 1 ? 's' : ''}
        </span>
      </div>

      {service.dependent_reports.length === 0 ? (
        <div className={styles.noDeps}>
          <p>No services report depending on this service.</p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Reporting Service</th>
                <th>Dependency Name</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Last Checked</th>
              </tr>
            </thead>
            <tbody>
              {service.dependent_reports.map((report) => (
                <tr key={report.dependency_id} className={styles.dependencyRow}>
                  <td>
                    <Link to={`/services/${report.reporting_service_id}`} className={styles.serviceLink}>
                      {report.reporting_service_name}
                    </Link>
                  </td>
                  <td className={styles.teamCell}>{report.dependency_name}</td>
                  <td>
                    <StatusBadge
                      status={getHealthStateBadgeStatus(report)}
                      size="small"
                      showLabel={true}
                    />
                  </td>
                  <td className={styles.latencyCell}>
                    {report.latency_ms !== null ? `${Math.round(report.latency_ms)}ms` : '-'}
                  </td>
                  <td className={styles.timeCell}>
                    {formatRelativeTime(report.last_checked)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DependencyList
        serviceId={service.id}
        dependencies={service.dependencies}
        canEditOverrides={canEditOverrides()}
        onServiceReload={loadService}
      />

      {service.is_active && !service.is_external && (
        <PollIssuesSection serviceId={service.id} />
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
        onConfirm={handleDeleteConfirm}
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
