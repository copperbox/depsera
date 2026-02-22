import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { GraphEdgeData } from '../../../types/graph';
import styles from './DependencyGraph.module.css';

type CustomEdgeType = Edge<GraphEdgeData, 'custom'>;
type CustomEdgeProps = EdgeProps<CustomEdgeType>;

/* istanbul ignore next -- @preserve
   formatLatency is a utility function used exclusively by CustomEdgeComponent which
   requires ReactFlow context. Testing would require mocking ReactFlow's internal
   rendering pipeline which is not feasible with unit tests. */
function formatLatency(latencyMs: number | null | undefined): string {
  if (latencyMs === null || latencyMs === undefined) {
    return '';
  }
  if (latencyMs >= 1000) {
    return `${(latencyMs / 1000).toFixed(1)}s`;
  }
  return `${Math.round(latencyMs)}ms`;
}

/* istanbul ignore next -- @preserve
   CustomEdgeComponent uses ReactFlow's BaseEdge, EdgeLabelRenderer, and getBezierPath
   which require ReactFlow's internal context. Unit testing this component would require
   mocking ReactFlow's entire rendering pipeline. Integration tests with Cypress/Playwright
   are the appropriate testing strategy for ReactFlow graph components. */
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

  const label = formatLatency(data?.latencyMs);
  const isHealthy = data?.healthy !== false;
  const isSelected = data?.isSelected ?? false;
  const isHighLatency = data?.isHighLatency ?? false;
  const opacity = style?.opacity ?? 1;

  // Determine edge class: high latency takes precedence over healthy/unhealthy for styling
  let edgeClass = isHealthy ? styles.healthyEdge : styles.unhealthyEdge;
  if (isHighLatency) {
    edgeClass = styles.highLatencyEdge;
  }

  // Determine label class
  let labelClass = styles.edgeLabel;
  if (!isHealthy) {
    labelClass += ` ${styles.edgeLabelUnhealthy}`;
  }
  if (isHighLatency) {
    labelClass += ` ${styles.edgeLabelHighLatency}`;
  }
  if (isSelected) {
    if (isHealthy) {
      labelClass += ` ${styles.edgeLabelSelectedHealthy}`;
    } else {
      labelClass += ` ${styles.edgeLabelSelectedUnhealthy}`;
    }
  }

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
            className={labelClass}
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
