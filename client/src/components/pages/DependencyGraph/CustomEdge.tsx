import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { GraphEdgeData } from '../../../types/graph';
import styles from './DependencyGraph.module.css';

type CustomEdgeType = Edge<GraphEdgeData, 'custom'>;
type CustomEdgeProps = EdgeProps<CustomEdgeType>;

const BORDER_RADIUS = 8;

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

/**
 * Build an orthogonal (right-angle) SVG path with rounded corners for TB layout.
 *
 * Path: source → vertical down → rounded bend → horizontal at laneY → rounded bend → vertical down → target
 */
function buildOrthogonalPathTB(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  laneY: number,
): { path: string; labelX: number; labelY: number } {
  if (sourceX === targetX) {
    return {
      path: `M ${sourceX},${sourceY} L ${targetX},${targetY}`,
      labelX: sourceX,
      labelY: laneY,
    };
  }

  const r = Math.max(
    0,
    Math.min(
      BORDER_RADIUS,
      Math.abs(laneY - sourceY) / 2,
      Math.abs(targetY - laneY) / 2,
      Math.abs(targetX - sourceX) / 2,
    ),
  );
  const dirX = targetX > sourceX ? 1 : -1;

  const path = [
    `M ${sourceX},${sourceY}`,
    `L ${sourceX},${laneY - r}`,
    `Q ${sourceX},${laneY} ${sourceX + dirX * r},${laneY}`,
    `L ${targetX - dirX * r},${laneY}`,
    `Q ${targetX},${laneY} ${targetX},${laneY + r}`,
    `L ${targetX},${targetY}`,
  ].join(' ');

  return {
    path,
    labelX: (sourceX + targetX) / 2,
    labelY: laneY,
  };
}

/**
 * Build an orthogonal SVG path with rounded corners for LR layout.
 *
 * Path: source → horizontal right → rounded bend → vertical at laneX → rounded bend → horizontal right → target
 */
function buildOrthogonalPathLR(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  laneX: number,
): { path: string; labelX: number; labelY: number } {
  if (sourceY === targetY) {
    return {
      path: `M ${sourceX},${sourceY} L ${targetX},${targetY}`,
      labelX: laneX,
      labelY: sourceY,
    };
  }

  const r = Math.max(
    0,
    Math.min(
      BORDER_RADIUS,
      Math.abs(laneX - sourceX) / 2,
      Math.abs(targetX - laneX) / 2,
      Math.abs(targetY - sourceY) / 2,
    ),
  );
  const dirY = targetY > sourceY ? 1 : -1;

  const path = [
    `M ${sourceX},${sourceY}`,
    `L ${laneX - r},${sourceY}`,
    `Q ${laneX},${sourceY} ${laneX},${sourceY + dirY * r}`,
    `L ${laneX},${targetY - dirY * r}`,
    `Q ${laneX},${targetY} ${laneX + r},${targetY}`,
    `L ${targetX},${targetY}`,
  ].join(' ');

  return {
    path,
    labelX: laneX,
    labelY: (sourceY + targetY) / 2,
  };
}

/* istanbul ignore next -- @preserve
   CustomEdgeComponent uses ReactFlow's BaseEdge, EdgeLabelRenderer, and path generation
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
  const routingLane = data?.routingLane;
  const direction = data?.layoutDirection;
  const edgeStyle = data?.edgeStyle ?? 'orthogonal';

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (edgeStyle === 'bezier') {
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  } else if (routingLane != null && direction) {
    if (direction === 'TB') {
      ({ path: edgePath, labelX, labelY } = buildOrthogonalPathTB(
        sourceX,
        sourceY,
        targetX,
        targetY,
        routingLane,
      ));
    } else {
      ({ path: edgePath, labelX, labelY } = buildOrthogonalPathLR(
        sourceX,
        sourceY,
        targetX,
        targetY,
        routingLane,
      ));
    }
  } else {
    // Fallback: smooth step path when no routing lane is assigned
    [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: BORDER_RADIUS,
    });
  }

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
