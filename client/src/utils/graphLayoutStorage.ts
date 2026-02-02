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

export function loadNodePositions(userId: string): NodePositions {
  try {
    const stored = localStorage.getItem(getStorageKey(userId));
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as NodePositions;
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
