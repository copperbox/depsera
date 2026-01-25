import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { DependencyNodeData, DependencyType, getDependencyHealthStatus } from '../../../types/graph';
import styles from './DependencyGraph.module.css';

type DependencyNodeType = Node<DependencyNodeData, 'dependency'>;

// Icons for each dependency type
const TypeIcon = ({ type }: { type: DependencyType }) => {
  switch (type) {
    case 'database':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.typeIcon}>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      );
    case 'rest':
    case 'soap':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.typeIcon}>
          <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4-3-9s1.34-9 3-9m-9 9a9 9 0 0 1 9-9" />
        </svg>
      );
    case 'grpc':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.typeIcon}>
          <path d="M4 4h16v16H4z" />
          <path d="M9 9h6v6H9z" />
          <path d="M4 12h5M15 12h5M12 4v5M12 15v5" />
        </svg>
      );
    case 'graphql':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.typeIcon}>
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'message_queue':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.typeIcon}>
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <rect x="3" y="10" width="18" height="4" rx="1" />
          <rect x="3" y="16" width="18" height="4" rx="1" />
          <path d="M7 6h.01M7 12h.01M7 18h.01" />
        </svg>
      );
    case 'cache':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.typeIcon}>
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      );
    case 'file_system':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.typeIcon}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'smtp':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.typeIcon}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-10 6L2 7" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.typeIcon}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      );
  }
};

function DependencyNodeComponent({ data, selected }: NodeProps<DependencyNodeType>) {
  const healthStatus = getDependencyHealthStatus(data);
  const isHorizontal = data.layoutDirection === 'LR';

  const formatLatency = (ms: number | null) => {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className={`${styles.dependencyNode} ${styles[healthStatus]} ${selected ? styles.selected : ''}`}>
      <Handle
        type="target"
        position={isHorizontal ? Position.Left : Position.Top}
        className={styles.handle}
      />

      <div className={styles.nodeNameRow}>
        <TypeIcon type={data.type} />
        <span className={styles.nodeName}>{data.name}</span>
      </div>

      <div className={styles.nodeDetails}>
        <span className={styles.serviceName}>via {data.serviceName}</span>
        {data.latencyMs !== null && (
          <span className={styles.latency}>{formatLatency(data.latencyMs)}</span>
        )}
      </div>

      <Handle
        type="source"
        position={isHorizontal ? Position.Right : Position.Bottom}
        className={styles.handle}
      />
    </div>
  );
}

export const DependencyNode = memo(DependencyNodeComponent);
