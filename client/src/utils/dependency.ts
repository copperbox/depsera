import type { Dependency } from '../types/service';

/**
 * Parse a JSON contact string into key-value pairs for display.
 * Returns null if the string is null/empty or not a valid JSON object.
 */
export function parseContact(contactJson: string | null): Record<string, string> | null {
  if (!contactJson) return null;
  try {
    const parsed = JSON.parse(contactJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a dependency has any active instance-level overrides.
 */
export function hasActiveOverride(dep: Dependency): boolean {
  return !!(dep.contact_override || dep.impact_override);
}
