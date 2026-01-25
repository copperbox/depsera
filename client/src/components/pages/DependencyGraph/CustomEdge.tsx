import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { GraphEdgeData, DependencyType } from '../../../types/graph';
import styles from './DependencyGraph.module.css';

type CustomEdgeType = Edge<GraphEdgeData, 'custom'>;
type CustomEdgeProps = EdgeProps<CustomEdgeType>;

const dependencyTypeLabels: Record<DependencyType, string> = {
  database: 'DB',
  rest: 'REST',
  soap: 'SOAP',
  grpc: 'gRPC',
  graphql: 'GQL',
  message_queue: 'MQ',
  cache: 'Cache',
  file_system: 'File',
  smtp: 'Mail',
  other: '',
};

function CustomEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
}: CustomEdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const label = data?.dependencyType ? dependencyTypeLabels[data.dependencyType] : '';
  const isHealthy = data?.healthy !== false;
  const isSelected = data?.isSelected ?? false;
  const edgeClass = isHealthy ? styles.healthyEdge : styles.unhealthyEdge;
  const opacity = style?.opacity ?? 1;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        className={`${styles.edge} ${edgeClass} ${isSelected ? styles.edgeSelected : ''}`}
        markerEnd="url(#arrow-dependency)"
        style={style}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className={`${styles.edgeLabel} ${!isHealthy ? styles.edgeLabelUnhealthy : ''} ${isSelected ? (isHealthy ? styles.edgeLabelSelectedHealthy : styles.edgeLabelSelectedUnhealthy) : ''}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              opacity,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const CustomEdge = memo(CustomEdgeComponent);
