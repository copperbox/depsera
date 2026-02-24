import type { Node, Edge } from '@xyflow/react';
import type { LayoutDirection } from '../types/graph';

export const DEFAULT_LANE_SPACING = 15;
export const DEFAULT_LANE_PADDING = 30;
export const MIN_LAYER_GAP = 100;

// Match the node dimensions from graphLayout.ts
const NODE_WIDTH = 180;
const NODE_HEIGHT = 100;

/**
 * Layer tolerance in pixels — nodes within this distance on the primary axis
 * are considered part of the same layer.
 */
const LAYER_TOLERANCE = 5;

// ---------------------------------------------------------------------------
// Internal types & helpers
// ---------------------------------------------------------------------------

interface Layer {
  position: number;
  nodeIds: string[];
}

/** Group positioned nodes into layers based on their primary-axis coordinate. */
function detectLayers(nodes: Node[], direction: LayoutDirection): Layer[] {
  const isTB = direction === 'TB';

  const sortedNodes = [...nodes].sort((a, b) => {
    const aVal = isTB ? a.position.y : a.position.x;
    const bVal = isTB ? b.position.y : b.position.x;
    return aVal - bVal;
  });

  const layers: Layer[] = [];
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

  layers.sort((a, b) => a.position - b.position);
  return layers;
}

/** Map each node ID to its layer index. */
function buildNodeLayerIndex(layers: Layer[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < layers.length; i++) {
    for (const nodeId of layers[i].nodeIds) {
      map.set(nodeId, i);
    }
  }
  return map;
}

/** Assign each inter-layer edge to the gap immediately after the earlier layer. */
function assignEdgesToGaps(
  edges: Edge[],
  nodeLayerIndex: Map<string, number>,
): Map<number, Edge[]> {
  const gapEdges = new Map<number, Edge[]>();

  for (const edge of edges) {
    const srcLayer = nodeLayerIndex.get(edge.source);
    const tgtLayer = nodeLayerIndex.get(edge.target);
    if (srcLayer === undefined || tgtLayer === undefined) continue;
    if (srcLayer === tgtLayer) continue;

    const gapIndex = Math.min(srcLayer, tgtLayer);

    if (!gapEdges.has(gapIndex)) {
      gapEdges.set(gapIndex, []);
    }
    gapEdges.get(gapIndex)!.push(edge);
  }

  return gapEdges;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Adjust layer positions so each inter-layer gap is sized to fit its routed
 * edges with padding.  Gaps with more edges get more space; gaps with fewer
 * edges stay compact.
 *
 * Call this BEFORE `computeEdgeRoutes` so the router sees the final positions.
 */
export function adjustLayerSpacing<T extends Node>(
  nodes: T[],
  edges: Edge[],
  direction: LayoutDirection,
  laneSpacing: number = DEFAULT_LANE_SPACING,
  padding: number = DEFAULT_LANE_PADDING,
): T[] {
  if (nodes.length === 0) return nodes;

  const layers = detectLayers(nodes, direction);
  if (layers.length <= 1) return nodes;

  const nodeLayerIndex = buildNodeLayerIndex(layers);
  const gapEdges = assignEdgesToGaps(edges, nodeLayerIndex);

  const isTB = direction === 'TB';
  const nodeDim = isTB ? NODE_HEIGHT : NODE_WIDTH;

  // Compute new layer positions with per-gap dynamic spacing
  const newPositions: number[] = [layers[0].position];
  for (let i = 1; i < layers.length; i++) {
    const edgeCount = gapEdges.get(i - 1)?.length ?? 0;
    const requiredGap = Math.max(
      MIN_LAYER_GAP,
      edgeCount * laneSpacing + 2 * padding,
    );
    newPositions[i] = newPositions[i - 1] + nodeDim + requiredGap;
  }

  // Build node → layer-index map for offset application
  const nodeLayer = new Map<string, number>();
  for (let i = 0; i < layers.length; i++) {
    for (const nodeId of layers[i].nodeIds) {
      nodeLayer.set(nodeId, i);
    }
  }

  return nodes.map((node) => {
    const layerIdx = nodeLayer.get(node.id);
    if (layerIdx === undefined) return node;
    const offset = newPositions[layerIdx] - layers[layerIdx].position;
    if (offset === 0) return node;

    return {
      ...node,
      position: isTB
        ? { ...node.position, y: node.position.y + offset }
        : { ...node.position, x: node.position.x + offset },
    };
  });
}

/**
 * Return the maximum number of edges routed through any single inter-layer gap.
 */
export function computeMaxLanesPerGap(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection,
): number {
  if (nodes.length === 0 || edges.length === 0) return 0;

  const layers = detectLayers(nodes, direction);
  const nodeLayerIndex = buildNodeLayerIndex(layers);
  const gapEdges = assignEdgesToGaps(edges, nodeLayerIndex);

  let max = 0;
  for (const edgeList of gapEdges.values()) {
    max = Math.max(max, edgeList.length);
  }
  return max;
}

/**
 * Compute orthogonal routing lane assignments for edges.
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

  // Build position map
  const posMap = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    posMap.set(node.id, { x: node.position.x, y: node.position.y });
  }

  const layers = detectLayers(nodes, direction);
  const nodeLayerIndex = buildNodeLayerIndex(layers);
  const gapEdges = assignEdgesToGaps(edges, nodeLayerIndex);

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
