/**
 * Utility functions for grouping and deduplicating collections.
 */

/**
 * Groups items by a specified key, returning a Map where each key maps to an array of items.
 * @param items - Array of items to group
 * @param key - The property key to group by
 * @returns Map of key values to arrays of matching items
 */
export function groupByKey<T, K extends keyof T>(items: T[], key: K): Map<T[K], T[]> {
  const map = new Map<T[K], T[]>();
  for (const item of items) {
    const keyValue = item[key];
    const existing = map.get(keyValue) || [];
    existing.push(item);
    map.set(keyValue, existing);
  }
  return map;
}

/**
 * Deduplicates an array of items by their 'id' property, keeping the first occurrence.
 * @param items - Array of items with 'id' property
 * @returns Deduplicated array
 */
export function deduplicateById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.set(item.id, item);
    }
  }
  return Array.from(seen.values());
}

/**
 * Deduplicates an array of items by a specified key property, keeping the first occurrence.
 * @param items - Array of items to deduplicate
 * @param key - The property key to deduplicate by
 * @returns Deduplicated array
 */
export function deduplicateByKey<T, K extends keyof T>(items: T[], key: K): T[] {
  const seen = new Map<T[K], T>();
  for (const item of items) {
    const keyValue = item[key];
    if (!seen.has(keyValue)) {
      seen.set(keyValue, item);
    }
  }
  return Array.from(seen.values());
}
