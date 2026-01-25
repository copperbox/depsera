import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { DependencyNodeData, getDependencyHealthStatus } from '../../../types/graph';
import styles from './DependencyGraph.module.css';

type DependencyNodeType = Node<DependencyNodeData, 'dependency'>;

function DependencyNodeComponent({ data, selected }: NodeProps<DependencyNodeType>) {
  const healthStatus = getDependencyHealthStatus(data);

  const formatLatency = (ms: number | null) => {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className={`${styles.dependencyNode} ${styles[healthStatus]} ${selected ? styles.selected : ''}`}>
      <Handle type="target" position={Position.Top} className={styles.handle} />

      <div className={styles.nodeHeader}>
        <div className={`${styles.statusIndicator} ${styles[healthStatus]}`} />
        <span className={styles.nodeType}>Dependency</span>
      </div>

      <div className={styles.nodeName}>{data.name}</div>

      <div className={styles.nodeDetails}>
        <span className={styles.serviceName}>via {data.serviceName}</span>
        {data.latencyMs !== null && (
          <span className={styles.latency}>{formatLatency(data.latencyMs)}</span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className={styles.handle} />
    </div>
  );
}

export const DependencyNode = memo(DependencyNodeComponent);
