import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { ServiceNodeData, getServiceHealthStatus } from '../../../types/graph';
import styles from './DependencyGraph.module.css';

type ServiceNodeType = Node<ServiceNodeData, 'service'>;

function ServiceNodeComponent({ data, selected }: NodeProps<ServiceNodeType>) {
  const healthStatus = getServiceHealthStatus(data);
  const isHorizontal = data.layoutDirection === 'LR';

  return (
    <div className={`${styles.serviceNode} ${styles[healthStatus]} ${selected ? styles.selected : ''}`}>
      <Handle
        type="target"
        position={isHorizontal ? Position.Left : Position.Top}
        className={styles.handle}
      />

      <div className={styles.nodeHeader}>
        <div className={`${styles.statusIndicator} ${styles[healthStatus]}`} />
        <span className={styles.nodeType}>Service</span>
      </div>

      <div className={styles.nodeName}>{data.name}</div>

      <div className={styles.nodeDetails}>
        <span className={styles.teamName}>{data.teamName}</span>
        <div className={styles.healthSummary}>
          {data.dependencyCount > 0 ? (
            <>
              <span className={styles.healthyCount}>{data.healthyCount}</span>
              <span className={styles.separator}>/</span>
              <span className={styles.totalCount}>{data.dependencyCount}</span>
              <span className={styles.label}>deps</span>
            </>
          ) : (
            <span className={styles.noDeps}>No deps</span>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={isHorizontal ? Position.Right : Position.Bottom}
        className={styles.handle}
      />
    </div>
  );
}

export const ServiceNode = memo(ServiceNodeComponent);
