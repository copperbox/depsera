import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { type Node, type Edge } from '@xyflow/react';
import { ServiceNodeData, GraphEdgeData, getServiceHealthStatus, getEdgeHealthStatus, HealthStatus } from '../../../types/graph';
import styles from './NodeDetailsPanel.module.css';

type AppNode = Node<ServiceNodeData, 'service'>;
type AppEdge = Edge<GraphEdgeData, 'custom'>;

interface NodeDetailsPanelProps {
  nodeId: string;
  data: ServiceNodeData;
  nodes: AppNode[];
  edges: AppEdge[];
  onClose: () => void;
}

const healthStatusLabels: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  unknown: 'Unknown',
};

interface DependencyInfo {
  id: string;
  name: string;
  healthStatus: HealthStatus;
  latencyMs?: number | null;
}

function formatLatency(latencyMs: number | null | undefined): string {
  if (latencyMs === null || latencyMs === undefined) {
    return '';
  }
  if (latencyMs >= 1000) {
    return `${(latencyMs / 1000).toFixed(1)}s`;
  }
  return `${Math.round(latencyMs)}ms`;
}

function NodeDetailsPanelComponent({ nodeId, data, nodes, edges, onClose }: NodeDetailsPanelProps) {
  const healthStatus = getServiceHealthStatus(data);

  // Build a map of node IDs to names for lookup
  const nodeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) {
      map.set(node.id, node.data.name);
    }
    return map;
  }, [nodes]);

  // Dependents: services that depend on THIS node (edges where this node is the source)
  const dependents = useMemo((): DependencyInfo[] => {
    return edges
      .filter((edge) => edge.source === nodeId)
      .map((edge) => ({
        id: edge.target,
        name: nodeNameMap.get(edge.target) || edge.target,
        healthStatus: getEdgeHealthStatus(edge.data!),
        latencyMs: edge.data?.latencyMs,
      }));
  }, [edges, nodeId, nodeNameMap]);

  // Dependencies: services THIS node depends on (edges where this node is the target)
  const dependencies = useMemo((): DependencyInfo[] => {
    return edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => ({
        id: edge.source,
        name: nodeNameMap.get(edge.source) || edge.source,
        healthStatus: getEdgeHealthStatus(edge.data!),
        latencyMs: edge.data?.latencyMs,
      }));
  }, [edges, nodeId, nodeNameMap]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>{data.name}</h3>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close panel">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 5L5 15M5 5l10 10" />
          </svg>
        </button>
      </div>

      <div className={styles.statusSection}>
        <div className={`${styles.statusBadge} ${styles[healthStatus]}`}>
          <span className={styles.statusDot} />
          {healthStatusLabels[healthStatus]}
        </div>
      </div>

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Details</h4>
        <div className={styles.detailsGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Team</span>
            <span className={styles.detailValue}>{data.teamName}</span>
          </div>
          {data.healthEndpoint && (
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Health Endpoint</span>
              <a
                href={data.healthEndpoint}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.detailLink}
              >
                {data.healthEndpoint}
              </a>
            </div>
          )}
        </div>
      </div>

      {dependents.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Dependents ({dependents.length})</h4>
          <p className={styles.sectionDescription}>Services that depend on this service</p>
          <ul className={styles.serviceList}>
            {dependents.map((dep) => (
              <li key={dep.id} className={styles.serviceListItem}>
                <span className={`${styles.healthDot} ${styles[dep.healthStatus]}`} />
                <Link to={`/services/${dep.id}`} className={styles.serviceLink}>
                  {dep.name}
                </Link>
                {formatLatency(dep.latencyMs) && (
                  <span className={styles.dependencyLabel}>{formatLatency(dep.latencyMs)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Dependencies Report</h4>
        <p className={styles.sectionDescription}>What this service reports about its dependencies</p>
        <div className={styles.statsGrid}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{data.dependencyCount}</span>
            <span className={styles.statLabel}>Total</span>
          </div>
          <div className={`${styles.statItem} ${styles.healthy}`}>
            <span className={styles.statValue}>{data.healthyCount}</span>
            <span className={styles.statLabel}>Healthy</span>
          </div>
          <div className={`${styles.statItem} ${styles.critical}`}>
            <span className={styles.statValue}>{data.unhealthyCount}</span>
            <span className={styles.statLabel}>Unhealthy</span>
          </div>
        </div>
        {dependencies.length > 0 && (
          <ul className={styles.serviceList}>
            {dependencies.map((dep) => (
              <li key={dep.id} className={styles.serviceListItem}>
                <span className={`${styles.healthDot} ${styles[dep.healthStatus]}`} />
                <Link to={`/services/${dep.id}`} className={styles.serviceLink}>
                  {dep.name}
                </Link>
                {formatLatency(dep.latencyMs) && (
                  <span className={styles.dependencyLabel}>{formatLatency(dep.latencyMs)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.actions}>
        <Link to={`/services/${nodeId}`} className={styles.viewDetailsButton}>
          View Full Details
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 12l4-4-4-4" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

export const NodeDetailsPanel = memo(NodeDetailsPanelComponent);
