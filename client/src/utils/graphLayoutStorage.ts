export interface NodePosition {
  x: number;
  y: number;
}

export type NodePositions = Record<string, NodePosition>;

const STORAGE_PREFIX = 'graph-node-positions';

function getStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}-${userId}`;
}

export function saveNodePositions(userId: string, positions: NodePositions): void {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(positions));
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

function isNodePosition(value: unknown): value is NodePosition {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as NodePosition).x === 'number' &&
    typeof (value as NodePosition).y === 'number' &&
    isFinite((value as NodePosition).x) &&
    isFinite((value as NodePosition).y)
  );
}

export function loadNodePositions(userId: string): NodePositions {
  try {
    const stored = localStorage.getItem(getStorageKey(userId));
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const validated: NodePositions = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (isNodePosition(value)) {
            validated[key] = value;
          }
        }
        return validated;
      }
    }
  } catch {
    // Corrupted data — return empty
  }
  return {};
}

export function clearNodePositions(userId: string): void {
  try {
    localStorage.removeItem(getStorageKey(userId));
  } catch {
    // silently fail
  }
}
