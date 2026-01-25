import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { GraphEdgeData, AssociationType } from '../../../types/graph';
import styles from './DependencyGraph.module.css';

type CustomEdgeType = Edge<GraphEdgeData, 'custom'>;
type CustomEdgeProps = EdgeProps<CustomEdgeType>;

const associationLabels: Record<AssociationType, string> = {
  api_call: 'API',
  database: 'DB',
  message_queue: 'Queue',
  cache: 'Cache',
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
  selected,
}: CustomEdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isAssociation = data?.relationship === 'depends_on';
  const label = data?.associationType ? associationLabels[data.associationType] : '';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        className={`${styles.edge} ${isAssociation ? styles.associationEdge : styles.reportEdge} ${selected ? styles.edgeSelected : ''}`}
        markerEnd={isAssociation ? 'url(#arrow-association)' : 'url(#arrow-report)'}
      />
      {isAssociation && label && (
        <EdgeLabelRenderer>
          <div
            className={styles.edgeLabel}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
          >
            {label}
            {data?.isAutoSuggested && (
              <span className={styles.autoSuggested} title="Auto-suggested">*</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const CustomEdge = memo(CustomEdgeComponent);
