import { memo } from 'react';
import { Link } from 'react-router-dom';
import { formatRelativeTime } from '../../../utils/formatting';
import { LatencyChart } from '../../Charts/LatencyChart';
import { HealthTimeline } from '../../Charts/HealthTimeline';
import type { HealthStatus } from '../../../types/service';
import type { WallboardDependency } from '../../../types/wallboard';
import styles from './DependencyDetailPanel.module.css';

interface DependencyDetailPanelProps {
  dependency: WallboardDependency;
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

function getReporterHealthClass(healthy: number | null): string {
  if (healthy === null) return styles.unknown;
  return healthy ? styles.healthy : styles.critical;
}

function formatLatency(ms: number | null): string {
  if (ms === null) return '';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function DependencyDetailPanelComponent({ dependency, onClose }: DependencyDetailPanelProps) {
  const healthClass = getHealthClass(dependency.health_status);

  return (
    <div className={styles.panel} data-testid="dependency-detail-panel">
      <div className={styles.header}>
        <h3 className={styles.title}>{dependency.canonical_name}</h3>
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
            {healthStatusLabels[dependency.health_status]}
          </div>
        </div>

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Details</h4>
          <div className={styles.detailsGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Type</span>
              <span className={styles.typeBadge}>{dependency.type}</span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Last checked</span>
              <span className={styles.detailValue}>
                {dependency.last_checked
                  ? formatRelativeTime(dependency.last_checked)
                  : 'Never'}
              </span>
            </div>
            {dependency.description && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Description</span>
                <span className={styles.detailValue}>{dependency.description}</span>
              </div>
            )}
            {dependency.impact && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Impact</span>
                <span className={styles.detailValue}>{dependency.impact}</span>
              </div>
            )}
          </div>
          {dependency.error_message && (
            <div className={styles.errorMessage}>
              {dependency.error_message}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>
            Reporting Services ({dependency.reporters.length})
          </h4>
          <ul className={styles.reporterList}>
            {dependency.reporters.map((reporter) => (
              <li key={reporter.dependency_id} className={styles.reporterItem}>
                <span className={`${styles.healthDot} ${getReporterHealthClass(reporter.healthy)}`} />
                <div className={styles.reporterInfo}>
                  <Link
                    to={`/services/${reporter.service_id}`}
                    className={styles.reporterServiceLink}
                  >
                    {reporter.service_name}
                  </Link>
                  <span className={styles.reporterTeam}>{reporter.service_team_name}</span>
                </div>
                {reporter.latency_ms !== null && (
                  <span className={styles.latencyLabel}>
                    {formatLatency(reporter.latency_ms)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {dependency.linked_service && (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Associated With</h4>
            <div className={styles.linkedService}>
              <Link
                to={`/services/${dependency.linked_service.id}`}
                className={styles.linkedServiceLink}
              >
                {dependency.linked_service.name}
              </Link>
            </div>
          </div>
        )}

        <div className={styles.chartSection}>
          <h4 className={styles.chartTitle}>Latency</h4>
          <LatencyChart
            dependencyId={dependency.primary_dependency_id}
            storageKey={`wallboard-latency-${dependency.primary_dependency_id}`}
          />
        </div>

        <div className={styles.chartSection}>
          <h4 className={styles.chartTitle}>Health Timeline</h4>
          <HealthTimeline
            dependencyId={dependency.primary_dependency_id}
            storageKey={`wallboard-timeline-${dependency.primary_dependency_id}`}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <Link
          to={`/graph?dependency=${dependency.primary_dependency_id}`}
          className={styles.actionLink}
        >
          View in Graph
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 12l4-4-4-4" />
          </svg>
        </Link>
        {dependency.linked_service && (
          <Link
            to={`/services/${dependency.linked_service.id}`}
            className={styles.secondaryLink}
          >
            View Linked Service
          </Link>
        )}
      </div>
    </div>
  );
}

export const DependencyDetailPanel = memo(DependencyDetailPanelComponent);
