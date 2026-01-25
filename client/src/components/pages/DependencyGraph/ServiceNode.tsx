import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { ServiceNodeData, getServiceHealthStatus, DependencyType } from '../../../types/graph';
import styles from './DependencyGraph.module.css';

type ServiceNodeType = Node<ServiceNodeData, 'service'>;

const TYPE_LABELS: Record<DependencyType, string> = {
  database: 'Database',
  rest: 'REST API',
  soap: 'SOAP',
  grpc: 'gRPC',
  graphql: 'GraphQL',
  message_queue: 'Message Queue',
  cache: 'Cache',
  file_system: 'File System',
  smtp: 'SMTP',
  other: 'Service',
};

function TypeIcon({ type }: { type?: DependencyType }) {
  const iconProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 };

  switch (type) {
    case 'database':
      return (
        <svg {...iconProps}>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
        </svg>
      );
    case 'rest':
    case 'soap':
    case 'graphql':
      return (
        <svg {...iconProps}>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <path d="M8 10h8M8 14h5" />
        </svg>
      );
    case 'grpc':
      return (
        <svg {...iconProps}>
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      );
    case 'message_queue':
      return (
        <svg {...iconProps}>
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      );
    case 'cache':
      return (
        <svg {...iconProps}>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      );
    case 'file_system':
      return (
        <svg {...iconProps}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'smtp':
      return (
        <svg {...iconProps}>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <path d="M22 6l-10 7L2 6" />
        </svg>
      );
    default:
      // Generic service/microservice icon
      return (
        <svg {...iconProps}>
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
  }
}

function ServiceNodeComponent({ data, selected }: NodeProps<ServiceNodeType>) {
  const healthStatus = getServiceHealthStatus(data);
  const isHorizontal = data.layoutDirection === 'LR';
  const typeLabel = data.serviceType ? TYPE_LABELS[data.serviceType] : 'Service';

  return (
    <div className={`${styles.serviceNode} ${styles[healthStatus]} ${selected ? styles.selected : ''}`}>
      <Handle
        type="target"
        position={isHorizontal ? Position.Left : Position.Top}
        className={styles.handle}
      />

      <div className={styles.nodeHeader}>
        <span className={styles.typeIcon}>
          <TypeIcon type={data.serviceType} />
        </span>
        <span className={styles.nodeType}>{typeLabel}</span>
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
