import type { Node, Edge } from '@xyflow/react';
import type { LayoutDirection } from '../types/graph';

export const DEFAULT_LANE_SPACING = 10;

// Match the node dimensions from graphLayout.ts
const NODE_WIDTH = 180;
const NODE_HEIGHT = 100;

/**
 * Layer tolerance in pixels — nodes within this distance on the primary axis
 * are considered part of the same layer.
 */
const LAYER_TOLERANCE = 5;

/**
 * Compute orthogonal routing lane assignments for edges after ELK positions nodes.
 *
 * Returns a Map from edge ID to lane coordinate:
 * - TB direction: lane is a Y coordinate for the horizontal routing segment
 * - LR direction: lane is an X coordinate for the vertical routing segment
 */
export function computeEdgeRoutes(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection,
  laneSpacing: number = DEFAULT_LANE_SPACING,
): Map<string, number> {
  if (nodes.length === 0 || edges.length === 0) {
    return new Map();
  }

  const isTB = direction === 'TB';

  // 1. Build position map
  const posMap = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    posMap.set(node.id, { x: node.position.x, y: node.position.y });
  }

  // 2. Identify layers by grouping nodes with similar primary-axis coordinate
  const sortedNodes = [...nodes].sort((a, b) => {
    const aVal = isTB ? a.position.y : a.position.x;
    const bVal = isTB ? b.position.y : b.position.x;
    return aVal - bVal;
  });

  const layers: { position: number; nodeIds: string[] }[] = [];
  for (const node of sortedNodes) {
    const pos = isTB ? node.position.y : node.position.x;
    const existingLayer = layers.find(
      (l) => Math.abs(l.position - pos) <= LAYER_TOLERANCE,
    );
    if (existingLayer) {
      existingLayer.nodeIds.push(node.id);
    } else {
      layers.push({ position: pos, nodeIds: [node.id] });
    }
  }

  // 3. Sort layers by position (should already be sorted, but be explicit)
  layers.sort((a, b) => a.position - b.position);

  // Build node-to-layer-index map
  const nodeLayerIndex = new Map<string, number>();
  for (let i = 0; i < layers.length; i++) {
    for (const nodeId of layers[i].nodeIds) {
      nodeLayerIndex.set(nodeId, i);
    }
  }

  // 4. For each edge, assign it to the inter-layer gap below the source layer
  const gapEdges = new Map<number, Edge[]>();

  for (const edge of edges) {
    const srcLayer = nodeLayerIndex.get(edge.source);
    const tgtLayer = nodeLayerIndex.get(edge.target);
    if (srcLayer === undefined || tgtLayer === undefined) continue;
    if (srcLayer === tgtLayer) continue; // same-layer edge — no routing needed

    // For forward edges: gap below source. For backward edges: gap below target.
    const gapIndex = Math.min(srcLayer, tgtLayer);

    if (!gapEdges.has(gapIndex)) {
      gapEdges.set(gapIndex, []);
    }
    gapEdges.get(gapIndex)!.push(edge);
  }

  // 5. For each gap, sort edges by target cross-axis position and assign lanes
  const result = new Map<string, number>();

  for (const [gapIndex, gapEdgeList] of gapEdges) {
    const nextLayerIndex = gapIndex + 1;
    if (nextLayerIndex >= layers.length) continue;

    // Sort by target cross-axis, sub-sort by source cross-axis for stability
    gapEdgeList.sort((a, b) => {
      const aTarget = posMap.get(a.target);
      const bTarget = posMap.get(b.target);
      const aCross = isTB ? (aTarget?.x ?? 0) : (aTarget?.y ?? 0);
      const bCross = isTB ? (bTarget?.x ?? 0) : (bTarget?.y ?? 0);
      if (aCross !== bCross) return aCross - bCross;

      const aSource = posMap.get(a.source);
      const bSource = posMap.get(b.source);
      const aSrcCross = isTB ? (aSource?.x ?? 0) : (aSource?.y ?? 0);
      const bSrcCross = isTB ? (bSource?.x ?? 0) : (bSource?.y ?? 0);
      return aSrcCross - bSrcCross;
    });

    // Compute gap center between this layer and the next
    const sourceLayerPos = layers[gapIndex].position;
    const targetLayerPos = layers[nextLayerIndex].position;

    let gapCenter: number;
    if (isTB) {
      gapCenter = (sourceLayerPos + NODE_HEIGHT + targetLayerPos) / 2;
    } else {
      gapCenter = (sourceLayerPos + NODE_WIDTH + targetLayerPos) / 2;
    }

    // Assign lanes centered around gap center
    const count = gapEdgeList.length;
    for (let i = 0; i < count; i++) {
      const lane = gapCenter + (i - (count - 1) / 2) * laneSpacing;
      result.set(gapEdgeList[i].id, lane);
    }
  }

  return result;
}
