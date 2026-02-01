import { useState, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import { fetchService } from '../../../api/services';
import { formatRelativeTime } from '../../../utils/formatting';
import type { ServiceWithDependencies, HealthStatus } from '../../../types/service';
import styles from './ServiceDetailPanel.module.css';

interface ServiceDetailPanelProps {
  serviceId: string;
  onClose: () => void;
}

const healthStatusLabels: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  unknown: 'Unknown',
};

function getHealthClass(status: HealthStatus): string {
  switch (status) {
    case 'healthy':
      return styles.healthy;
    case 'warning':
      return styles.warning;
    case 'critical':
      return styles.critical;
    default:
      return styles.unknown;
  }
}

function getDepHealthClass(healthy: number | null): string {
  if (healthy === null) return styles.unknown;
  return healthy ? styles.healthy : styles.critical;
}

function ServiceDetailPanelComponent({ serviceId, onClose }: ServiceDetailPanelProps) {
  const [service, setService] = useState<ServiceWithDependencies | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchService(serviceId)
      .then((data) => {
        if (!cancelled) {
          setService(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load service');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  if (isLoading) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.title}>Loading...</h3>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close panel">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 5L5 15M5 5l10 10" />
            </svg>
          </button>
        </div>
        <div className={styles.loadingBody}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  if (error || !service) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.title}>Error</h3>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close panel">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 5L5 15M5 5l10 10" />
            </svg>
          </button>
        </div>
        <div className={styles.errorBody}>{error || 'Service not found'}</div>
      </div>
    );
  }

  const healthClass = getHealthClass(service.health.status);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>{service.name}</h3>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close panel">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 5L5 15M5 5l10 10" />
          </svg>
        </button>
      </div>

      <div className={styles.scrollContent}>
        <div className={styles.statusSection}>
          <div className={`${styles.statusBadge} ${healthClass}`}>
            <span className={styles.statusDot} />
            {healthStatusLabels[service.health.status]}
          </div>
          {service.last_poll_success === 0 && (
            <div className={styles.pollFailure}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 5v3M8 10v1" />
              </svg>
              Poll failed{service.last_poll_error ? `: ${service.last_poll_error}` : ''}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Details</h4>
          <div className={styles.detailsGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Team</span>
              <Link to={`/teams/${service.team_id}`} className={styles.detailLink}>
                {service.team.name}
              </Link>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Health Endpoint</span>
              <span className={styles.detailValue}>{service.health_endpoint}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Last Report</span>
              <span className={styles.detailValue}>
                {service.health.last_report
                  ? formatRelativeTime(service.health.last_report)
                  : 'Never'}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Health Summary</h4>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{service.health.total_reports}</span>
              <span className={styles.statLabel}>Reports</span>
            </div>
            <div className={`${styles.statItem} ${styles.healthy}`}>
              <span className={styles.statValue}>{service.health.healthy_reports}</span>
              <span className={styles.statLabel}>Healthy</span>
            </div>
            <div className={`${styles.statItem} ${styles.critical}`}>
              <span className={styles.statValue}>
                {service.health.warning_reports + service.health.critical_reports}
              </span>
              <span className={styles.statLabel}>Unhealthy</span>
            </div>
          </div>
        </div>

        {service.dependencies.length > 0 && (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>
              Dependencies ({service.dependencies.length})
            </h4>
            <p className={styles.sectionDescription}>What this service depends on</p>
            <ul className={styles.serviceList}>
              {service.dependencies.map((dep) => (
                <li key={dep.id} className={styles.serviceListItem}>
                  <span className={`${styles.healthDot} ${getDepHealthClass(dep.healthy)}`} />
                  <span className={styles.serviceName}>{dep.name}</span>
                  {dep.latency_ms !== null && (
                    <span className={styles.latencyLabel}>
                      {dep.latency_ms >= 1000
                        ? `${(dep.latency_ms / 1000).toFixed(1)}s`
                        : `${Math.round(dep.latency_ms)}ms`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {service.health.status === 'critical' &&
          service.dependencies.some((d) => d.healthy === 0 && d.impact !== null) && (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Impact</h4>
            <p className={styles.sectionDescription}>Dependencies currently reporting down</p>
            <ul className={styles.serviceList}>
              {service.dependencies
                .filter((d) => d.healthy === 0 && d.impact !== null)
                .map((dep) => (
                  <li key={dep.id} className={styles.serviceListItem}>
                    <span className={`${styles.healthDot} ${styles.critical}`} />
                    <div className={styles.impactItem}>
                      <span className={styles.impactDepName}>{dep.name}</span>
                      <span className={styles.impactText}>{dep.impact}</span>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {service.dependent_reports.length > 0 && (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>
              Dependent Reports ({service.dependent_reports.length})
            </h4>
            <p className={styles.sectionDescription}>Services that depend on this one</p>
            <ul className={styles.serviceList}>
              {service.dependent_reports.map((report) => (
                <li key={report.dependency_id} className={styles.serviceListItem}>
                  <span
                    className={`${styles.healthDot} ${getDepHealthClass(report.healthy)}`}
                  />
                  <Link
                    to={`/services/${report.reporting_service_id}`}
                    className={styles.serviceLink}
                  >
                    {report.reporting_service_name}
                  </Link>
                  {report.latency_ms !== null && (
                    <span className={styles.latencyLabel}>
                      {report.latency_ms >= 1000
                        ? `${(report.latency_ms / 1000).toFixed(1)}s`
                        : `${Math.round(report.latency_ms)}ms`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {(() => {
              const downImpacts = service.dependent_reports
                .filter((r) => r.healthy === 0 && r.impact)
                .map((r) => `${r.reporting_service_name}: ${r.impact}`);
              if (downImpacts.length === 0) return null;
              return (
                <div className={styles.impactSummary}>
                  <span className={styles.impactLabel}>Impact</span>
                  <p className={styles.impactText}>{downImpacts.join(' ')}</p>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <Link to={`/services/${serviceId}`} className={styles.viewDetailsButton}>
          View Full Details
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 12l4-4-4-4" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

export const ServiceDetailPanel = memo(ServiceDetailPanelComponent);
