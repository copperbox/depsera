import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useServiceDetail } from '../../../hooks/useServiceDetail';
import type { Dependency } from '../../../types/service';
import StatusBadge from '../../common/StatusBadge';
import Modal from '../../common/Modal';
import ConfirmDialog from '../../common/ConfirmDialog';
import { ErrorHistoryPanel } from '../../common/ErrorHistoryPanel';
import { LatencyChart, HealthTimeline } from '../../Charts';
import ServiceForm from './ServiceForm';
import ServiceAssociations from './ServiceAssociations';
import { formatRelativeTime } from '../../../utils/formatting';
import { getHealthBadgeStatus, getHealthStateBadgeStatus } from '../../../utils/statusMapping';
import styles from './Services.module.css';

/**
 * Parse a JSON contact string into key-value pairs for display.
 * Returns null if the string is null/empty or not a valid JSON object.
 */
function parseContact(contactJson: string | null): Record<string, string> | null {
  if (!contactJson) return null;
  try {
    const parsed = JSON.parse(contactJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a dependency has any active instance-level overrides.
 */
function hasActiveOverride(dep: Dependency): boolean {
  return !!(dep.contact_override || dep.impact_override);
}

function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();

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
  const [errorHistoryDep, setErrorHistoryDep] = useState<Dependency | null>(null);
  const [expandedCharts, setExpandedCharts] = useState<Set<string>>(new Set());

  const toggleChart = useCallback((depId: string) => {
    setExpandedCharts(prev => {
      const next = new Set(prev);
      if (next.has(depId)) {
        next.delete(depId);
      } else {
        next.add(depId);
      }
      return next;
    });
  }, []);

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

      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Dependencies</h2>
        <span className={styles.sectionSubtitle}>
          What this service depends on
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
                <th>Contact</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Last Checked</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {service.dependencies.map((dep) => {
                const contact = parseContact(dep.effective_contact);
                const overrideActive = hasActiveOverride(dep);
                return (
                  <tr key={dep.id} className={styles.dependencyRow}>
                    <td>
                      {dep.canonical_name ? (
                        <>
                          <strong>{dep.canonical_name}</strong>
                          <br />
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            {dep.name}
                          </span>
                        </>
                      ) : (
                        dep.name
                      )}
                    </td>
                    <td className={styles.teamCell}>{dep.description || '-'}</td>
                    <td className={styles.impactCell}>
                      <span className={styles.impactText} title={dep.effective_impact || undefined}>
                        {dep.effective_impact || '-'}
                      </span>
                      {overrideActive && dep.impact_override && (
                        <span className={styles.overrideBadge} title="Instance override active">
                          override
                        </span>
                      )}
                    </td>
                    <td className={styles.contactCell}>
                      {contact ? (
                        <ul className={styles.contactList}>
                          {Object.entries(contact).map(([key, value]) => (
                            <li key={key}>
                              <span className={styles.contactKey}>{key}:</span>{' '}
                              {String(value)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        '-'
                      )}
                      {overrideActive && dep.contact_override && (
                        <span className={styles.overrideBadge} title="Instance override active">
                          override
                        </span>
                      )}
                    </td>
                    <td>
                      <StatusBadge
                        status={getHealthStateBadgeStatus(dep)}
                        size="small"
                        showLabel={true}
                      />
                    </td>
                    <td className={styles.latencyCell}>
                      {dep.latency_ms !== null ? `${Math.round(dep.latency_ms)}ms` : '-'}
                    </td>
                    <td className={styles.timeCell}>
                      {formatRelativeTime(dep.last_checked)}
                    </td>
                    <td className={styles.actionsCell}>
                      <button
                        className={styles.historyButton}
                        onClick={() => setErrorHistoryDep(dep)}
                        title="View error history"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M8 4v4l2.5 2.5" />
                          <circle cx="8" cy="8" r="6" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ServiceAssociations serviceId={service.id} dependencies={service.dependencies} />

      {service.dependencies.length > 0 && (
        <>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Dependency Metrics</h2>
            <span className={styles.sectionSubtitle}>
              Latency and health trends
            </span>
          </div>
          {service.dependencies.map((dep) => (
            <div key={dep.id} className={styles.chartPanel}>
              <button
                className={`${styles.chartPanelHeader} ${expandedCharts.has(dep.id) ? styles.chartPanelHeaderExpanded : ''}`}
                onClick={() => toggleChart(dep.id)}
                aria-expanded={expandedCharts.has(dep.id)}
              >
                <span className={styles.chartPanelName}>
                  {dep.canonical_name || dep.name}
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`${styles.chevron} ${expandedCharts.has(dep.id) ? styles.chevronExpanded : ''}`}
                >
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </button>
              {expandedCharts.has(dep.id) && (
                <div className={styles.chartPanelContent}>
                  <LatencyChart
                    dependencyId={dep.id}
                    storageKey={`latency-range-${service.id}`}
                  />
                  <HealthTimeline
                    dependencyId={dep.id}
                    storageKey={`timeline-range-${service.id}`}
                  />
                </div>
              )}
            </div>
          ))}
        </>
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

      <Modal
        isOpen={errorHistoryDep !== null}
        onClose={() => setErrorHistoryDep(null)}
        title=""
        size="small"
      >
        {errorHistoryDep && (
          <div className={styles.errorHistoryModalContent}>
            <ErrorHistoryPanel
              dependencyId={errorHistoryDep.id}
              dependencyName={errorHistoryDep.name}
              onBack={() => setErrorHistoryDep(null)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

export default ServiceDetail;
