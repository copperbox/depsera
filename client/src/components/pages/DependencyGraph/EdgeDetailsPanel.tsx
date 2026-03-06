import { memo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { type Node } from '@xyflow/react';
import { X, XCircle, ChevronDown, ArrowRight, Clock, ChevronRight, Shrink } from 'lucide-react';
import { ServiceNodeData, GraphEdgeData, getEdgeHealthStatus, HealthStatus } from '../../../types/graph';
import { LatencyChart } from '../../Charts/LatencyChart';
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
  onIsolate?: (dependencyId: string) => void;
}

const healthStatusLabels: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  unknown: 'Unknown',
};

function formatCheckDetailValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Parse a JSON contact string into key-value pairs for display.
 * Returns null if the string is null/empty or not a valid JSON object.
 */
function parseContact(contactJson: string | null | undefined): Record<string, string> | null {
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

function EdgeDetailsPanelComponent({ data, sourceNode, targetNode, onClose, onIsolate }: EdgeDetailsPanelProps) {
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [currentView, setCurrentView] = useState<PanelView>('details');

  const healthStatus = getEdgeHealthStatus(data);
  const isHighLatency = data.isHighLatency ?? false;
  const hasError = data.error !== undefined || data.errorMessage;
  const hasCheckDetails = data.checkDetails && Object.keys(data.checkDetails).length > 0;
  const contact = parseContact(data.effectiveContact);

  // Display name: prefer canonical name, then linked service name, then raw name
  const displayName = data.canonicalName || sourceNode?.data.name || data.dependencyName || 'Connection';

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
          dependencyName={displayName}
          onBack={() => setCurrentView('details')}
        />
      </div>
    );
  }

  // Render main details view
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>{displayName}</h3>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close panel">
          <X size={16} />
        </button>
      </div>

      <div className={styles.scrollContent}>
        <div className={styles.statusSection}>
          {/* eslint-disable-next-line security/detect-object-injection */}
          <div className={`${styles.statusBadge} ${styles[healthStatus]}`}>
            <span className={styles.statusDot} />
            {/* eslint-disable-next-line security/detect-object-injection */}
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
              <XCircle size={16} />
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
                  <ChevronDown size={12} className={showErrorDetails ? styles.rotated : ''} />
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
              <ArrowRight size={16} />
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

        {contact && (
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Contact</h4>
            <dl className={styles.contactList} data-testid="contact-section">
              {Object.entries(contact).map(([key, value]) => (
                <div key={key} className={styles.contactItem}>
                  <dt className={styles.contactKey}>{key}</dt>
                  <dd className={styles.contactValue}>{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {data.dependencyId && (
          <div className={styles.chartSection}>
            <LatencyChart
              dependencyId={data.dependencyId}
              storageKey={`graph-latency-${data.dependencyId}`}
            />
          </div>
        )}

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
              <Clock size={14} />
              View Error History (24h)
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        {onIsolate && data.dependencyId && (
          <button
            className={styles.isolateButton}
            onClick={() => onIsolate(data.dependencyId!)}
          >
            <Shrink size={14} />
            Isolate tree
          </button>
        )}
        {targetNode && (
          <Link to={`/services/${targetNode.id}`} className={styles.viewDetailsButton}>
            View Service Details
            <ChevronRight size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}

export const EdgeDetailsPanel = memo(EdgeDetailsPanelComponent);
