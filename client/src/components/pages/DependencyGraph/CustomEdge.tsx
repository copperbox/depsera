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

const EDGE_SPREAD = 12; // pixels between each edge in a fan-out group

/**
 * Compute a perpendicular offset for edge fan-out.
 * Offsets are centered around zero so the middle edge stays on the node center.
 */
function computeFanOffset(index: number, count: number): number {
  if (count <= 1) return 0;
  // Center the spread: e.g. for count=3, offsets are -12, 0, +12
  return (index - (count - 1) / 2) * EDGE_SPREAD;
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
  // Apply fan-out offsets to separate overlapping edges
  const sourceOffset = computeFanOffset(data?.sourceIndex ?? 0, data?.sourceCount ?? 1);
  const targetOffset = computeFanOffset(data?.targetIndex ?? 0, data?.targetCount ?? 1);
  const isVertical = data?.layoutDirection !== 'LR';

  // In TB layout, offset along X axis (perpendicular to vertical flow)
  // In LR layout, offset along Y axis (perpendicular to horizontal flow)
  const adjSourceX = isVertical ? sourceX + sourceOffset : sourceX;
  const adjSourceY = isVertical ? sourceY : sourceY + sourceOffset;
  const adjTargetX = isVertical ? targetX + targetOffset : targetX;
  const adjTargetY = isVertical ? targetY : targetY + targetOffset;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: adjSourceX,
    sourceY: adjSourceY,
    sourcePosition,
    targetX: adjTargetX,
    targetY: adjTargetY,
    targetPosition,
  });

  const label = formatLatency(data?.latencyMs);
  const isHealthy = data?.healthy !== false;
  const isSelected = data?.isSelected ?? false;
  const isHighLatency = data?.isHighLatency ?? false;
  const opacity = Number(style?.opacity ?? 1);

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
      {label && opacity >= 0.5 && (
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
