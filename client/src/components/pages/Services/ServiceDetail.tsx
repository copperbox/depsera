import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ChevronLeft,
  Maximize2,
  RefreshCw,
  Pencil,
  Trash2,
  FileCode2,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useServiceDetail } from '../../../hooks/useServiceDetail';
import StatusBadge from '../../common/StatusBadge';
import Modal from '../../common/Modal';
import ConfirmDialog from '../../common/ConfirmDialog';
import { Tabs, TabList, Tab, TabPanel } from '../../common/Tabs';
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

  const canEditOverrides = useCallback((): boolean => {
    if (isAdmin) return true;
    if (!user || !service) return false;
    const membership = user.teams?.find(t => t.team_id === service.team_id);
    return membership?.role === 'lead';
  }, [isAdmin, user, service]);

  useEffect(() => {
    loadService();
  }, [loadService]);

  /* istanbul ignore next -- @preserve */
  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    loadService();
  };

  /* istanbul ignore next -- @preserve */
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
        <ChevronLeft size={16} />
        Back to Services
      </Link>

      {error && (
        <div className={styles.error} style={{ marginBottom: '1rem', padding: '0.75rem 1rem' }}>
          {error}
        </div>
      )}

      <Tabs defaultTab="overview" urlParam="tab" storageKey={`service-${id}-tab`}>
        <TabList aria-label="Service detail tabs">
          <Tab value="overview">Overview</Tab>
          <Tab value="dependencies">
            Dependencies ({service.dependencies.length})
          </Tab>
          <Tab value="reports">
            Dependent Reports ({service.dependent_reports.length})
          </Tab>
          <Tab value="poll-issues">Poll Issues</Tab>
        </TabList>

        {/* Overview Tab */}
        <TabPanel value="overview">
          <div className={styles.detailHeader}>
            <div className={styles.serviceTitle}>
              <h1>{service.name}</h1>
              <StatusBadge status={getHealthBadgeStatus(service.health.status)} />
              {service.manifest_managed === 1 && (
                <span className={styles.manifestBadge} title="Managed by manifest">M</span>
              )}
              {!service.is_active && <span className={styles.inactiveBadge}>Inactive</span>}
            </div>
            <div className={styles.actions}>
              <Link
                to={`/graph?isolateService=${id}`}
                className={`${styles.actionButton} ${styles.graphLink}`}
              >
                <Maximize2 size={16} />
                View in Graph
              </Link>
              <button
                onClick={handlePoll}
                disabled={isPolling}
                className={`${styles.actionButton} ${styles.pollButton}`}
              >
                {isPolling ? (
                  <>
                    <Loader2 size={16} className={styles.spinnerSmall} />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} />
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
                    <Pencil size={16} />
                    Edit
                  </button>
                  <button
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className={`${styles.actionButton} ${styles.deleteButton}`}
                  >
                    <Trash2 size={16} />
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
                  <span className={styles.metadataValue} style={{ color: 'var(--color-critical)' }}>
                    Failed: {service.last_poll_error || 'Unknown error'}
                  </span>
                </div>
              )}
              <div className={styles.metadataItem}>
                <span className={styles.metadataLabel}>Last Updated</span>
                <span className={styles.metadataValue}>{formatRelativeTime(service.updated_at)}</span>
              </div>
              {service.manifest_managed === 1 && (
                <div className={styles.metadataItem}>
                  <span className={styles.metadataLabel}>Manifest</span>
                  <span className={styles.manifestInfo}>
                    <FileCode2 size={14} className={styles.manifestInfoIcon} />
                    Managed by manifest{service.manifest_key ? ` · Key: ${service.manifest_key}` : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
        </TabPanel>

        {/* Dependencies Tab */}
        <TabPanel value="dependencies">
          <DependencyList
            serviceId={service.id}
            dependencies={service.dependencies}
            canEditOverrides={canEditOverrides()}
            onServiceReload={loadService}
          />
        </TabPanel>

        {/* Dependent Reports Tab */}
        <TabPanel value="reports">
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
        </TabPanel>

        {/* Poll Issues Tab */}
        <TabPanel value="poll-issues">
          {service.is_active && !service.is_external ? (
            <PollIssuesSection serviceId={service.id} />
          ) : (
            <div className={styles.noDeps}>
              <p>
                {service.is_external
                  ? 'Not applicable for external services.'
                  : 'Not applicable for inactive services.'}
              </p>
            </div>
          )}
        </TabPanel>
      </Tabs>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Service"
        size="md"
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
