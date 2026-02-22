import { memo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { type Node } from '@xyflow/react';
import { ServiceNodeData, GraphEdgeData, getEdgeHealthStatus, HealthStatus, LatencyStatsResponse } from '../../../types/graph';
import { fetchLatencyStats } from '../../../api/latency';
import { ErrorHistoryPanel } from '../../common/ErrorHistoryPanel';
import styles from './EdgeDetailsPanel.module.css';

type AppNode = Node<ServiceNodeData, 'service'>;

type PanelView = 'details' | 'errorHistory';

interface EdgeDetailsPanelProps {
  edgeId: string;
  data: GraphEdgeData;
  sourceNode?: AppNode;
  targetNode?: AppNode;
  onClose: () => void;
}

const healthStatusLabels: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  unknown: 'Unknown',
};

function formatLatency(latencyMs: number | null | undefined): string {
  if (latencyMs === null || latencyMs === undefined) {
    return '-';
  }
  if (latencyMs >= 1000) {
    return `${(latencyMs / 1000).toFixed(1)}s`;
  }
  return `${Math.round(latencyMs)}ms`;
}

function formatCheckDetailValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function EdgeDetailsPanelComponent({ data, sourceNode, targetNode, onClose }: EdgeDetailsPanelProps) {
  const [latencyStats, setLatencyStats] = useState<LatencyStatsResponse | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [currentView, setCurrentView] = useState<PanelView>('details');

  const healthStatus = getEdgeHealthStatus(data);
  const isHighLatency = data.isHighLatency ?? false;
  const hasError = data.error !== undefined || data.errorMessage;
  const hasCheckDetails = data.checkDetails && Object.keys(data.checkDetails).length > 0;

  // Fetch latency stats when panel opens
  useEffect(() => {
    if (data.dependencyId) {
      setIsLoadingStats(true);
      fetchLatencyStats(data.dependencyId)
        .then(setLatencyStats)
        .catch((error) => {
          console.error('Failed to fetch latency stats:', error);
        })
        .finally(() => setIsLoadingStats(false));
    }
  }, [data.dependencyId]);

  // Reset view when dependency changes
  useEffect(() => {
    setCurrentView('details');
  }, [data.dependencyId]);

  // Render error history view
  if (currentView === 'errorHistory' && data.dependencyId) {
    return (
      <div className={styles.panel}>
        <ErrorHistoryPanel
          dependencyId={data.dependencyId}
          dependencyName={data.dependencyName || 'Unknown'}
          onBack={() => setCurrentView('details')}
        />
      </div>
    );
  }

  // Render main details view
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>{data.dependencyName || 'Connection'}</h3>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close panel">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 5L5 15M5 5l10 10" />
          </svg>
        </button>
      </div>

      <div className={styles.scrollContent}>
        <div className={styles.statusSection}>
          <div className={`${styles.statusBadge} ${styles[healthStatus]}`}>
            <span className={styles.statusDot} />
            {healthStatusLabels[healthStatus]}
          </div>
          {isHighLatency && (
            <div className={`${styles.statusBadge} ${styles.highLatency}`}>
              <span className={styles.statusDot} />
              High Latency
            </div>
          )}
        </div>

        {/* Error Alert Section */}
        {hasError && (
          <div className={styles.errorAlert}>
            <div className={styles.errorAlertHeader}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className={styles.errorAlertTitle}>Error Detected</span>
            </div>
            {data.errorMessage && (
              <p className={styles.errorMessage}>{data.errorMessage}</p>
            )}
            {data.error !== undefined && (
              <>
                <button
                  className={styles.errorToggle}
                  onClick={() => setShowErrorDetails(!showErrorDetails)}
                >
                  {showErrorDetails ? 'Hide' : 'Show'} error details
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={showErrorDetails ? styles.rotated : ''}
                  >
                    <path d="M3 5l3 3 3-3" />
                  </svg>
                </button>
                {showErrorDetails && (
                  <pre className={styles.errorDetails}>
                    {typeof data.error === 'object'
                      ? JSON.stringify(data.error, null, 2)
                      : String(data.error)}
                  </pre>
                )}
              </>
            )}
          </div>
        )}

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Connection</h4>
          <div className={styles.connectionFlow}>
            <div className={styles.connectionNode}>
              <span className={styles.connectionLabel}>From</span>
              {sourceNode ? (
                <Link to={`/services/${sourceNode.id}`} className={styles.connectionLink}>
                  {sourceNode.data.name}
                </Link>
              ) : (
                <span className={styles.connectionText}>Unknown</span>
              )}
            </div>
            <div className={styles.connectionArrow}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </div>
            <div className={styles.connectionNode}>
              <span className={styles.connectionLabel}>To</span>
              {targetNode ? (
                <Link to={`/services/${targetNode.id}`} className={styles.connectionLink}>
                  {targetNode.data.name}
                </Link>
              ) : (
                <span className={styles.connectionText}>Unknown</span>
              )}
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Latency Statistics</h4>
          {isLoadingStats ? (
            <div className={styles.loadingStats}>
              <div className={styles.spinner} />
              <span>Loading stats...</span>
            </div>
          ) : (
            <div className={styles.statsGrid}>
              <div className={`${styles.statItem} ${isHighLatency ? styles.highLatencyStat : ''}`}>
                <span className={styles.statValue}>{formatLatency(data.latencyMs)}</span>
                <span className={styles.statLabel}>Current</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>
                  {latencyStats ? formatLatency(latencyStats.avgLatencyMs24h) : formatLatency(data.avgLatencyMs24h)}
                </span>
                <span className={styles.statLabel}>24h Avg</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>
                  {latencyStats ? formatLatency(latencyStats.minLatencyMs24h) : '-'}
                </span>
                <span className={styles.statLabel}>24h Min</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>
                  {latencyStats ? formatLatency(latencyStats.maxLatencyMs24h) : '-'}
                </span>
                <span className={styles.statLabel}>24h Max</span>
              </div>
            </div>
          )}
          {latencyStats && latencyStats.dataPointCount > 0 && (
            <div className={styles.dataPointInfo}>
              Based on {latencyStats.dataPointCount} data point{latencyStats.dataPointCount !== 1 ? 's' : ''} in the last 24 hours
            </div>
          )}
        </div>

        {data.impact && (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Impact</h4>
            <p className={styles.impactText}>{data.impact}</p>
          </div>
        )}

        {data.dependencyType && (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Details</h4>
            <div className={styles.detailsGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Type</span>
                <span className={styles.detailValue}>{data.dependencyType.replace('_', ' ')}</span>
              </div>
              {data.associationType && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Association</span>
                  <span className={styles.detailValue}>{data.associationType.replace('_', ' ')}</span>
                </div>
              )}
              {data.isAutoSuggested !== undefined && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Source</span>
                  <span className={styles.detailValue}>
                    {data.isAutoSuggested ? 'Auto-suggested' : 'Manual'}
                  </span>
                </div>
              )}
              {data.confidenceScore !== null && data.confidenceScore !== undefined && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Confidence</span>
                  <span className={styles.detailValue}>{Math.round(data.confidenceScore * 100)}%</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Check Details Section */}
        {hasCheckDetails && (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Check Details</h4>
            <div className={styles.checkDetailsGrid}>
              {Object.entries(data.checkDetails!).map(([key, value]) => (
                <div key={key} className={styles.checkDetailItem}>
                  <span className={styles.checkDetailKey}>{key}</span>
                  <span className={styles.checkDetailValue}>{formatCheckDetailValue(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error History Button */}
        {data.dependencyId && (
          <div className={styles.section}>
            <button
              className={styles.viewErrorHistoryButton}
              onClick={() => setCurrentView('errorHistory')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 4v4l2.5 2.5" />
                <circle cx="8" cy="8" r="6" />
              </svg>
              View Error History (24h)
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 4l4 4-4 4" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {targetNode && (
        <div className={styles.actions}>
          <Link to={`/services/${targetNode.id}`} className={styles.viewDetailsButton}>
            View Service Details
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 12l4-4-4-4" />
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
}

export const EdgeDetailsPanel = memo(EdgeDetailsPanelComponent);
