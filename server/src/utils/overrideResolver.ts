/**
 * Override resolver utility for the 3-tier merge hierarchy:
 *   instance override > canonical override > polled data
 *
 * Contact: field-level merge (override keys win, polled keys fill gaps)
 * Impact: first non-null wins
 */

/**
 * Safely parse a JSON string into a Record, or return null if invalid/empty.
 */
function parseContactJson(value: string | null | undefined): Record<string, unknown> | null {
  if (value == null || value === '') return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve effective contact from the 3-tier hierarchy using field-level merge.
 *
 * Each tier is a JSON string (or null). The merge spreads polled fields first,
 * then canonical override fields on top, then instance override fields on top.
 * This means instance keys win over canonical, which win over polled.
 *
 * Returns the merged JSON string, or null if no contact data exists at any tier.
 */
export function resolveContact(
  polled: string | null | undefined,
  canonicalOverride: string | null | undefined,
  instanceOverride: string | null | undefined,
): string | null {
  const polledObj = parseContactJson(polled);
  const canonicalObj = parseContactJson(canonicalOverride);
  const instanceObj = parseContactJson(instanceOverride);

  if (!polledObj && !canonicalObj && !instanceObj) {
    return null;
  }

  const merged: Record<string, unknown> = {
    ...(polledObj ?? {}),
    ...(canonicalObj ?? {}),
    ...(instanceObj ?? {}),
  };

  return JSON.stringify(merged);
}

/**
 * Resolve effective impact from the 3-tier hierarchy using first-non-null precedence.
 *
 * Returns the first non-null/non-undefined value in order:
 *   instanceOverride > canonicalOverride > polled
 *
 * Returns null if all are null/undefined.
 */
export function resolveImpact(
  polled: string | null | undefined,
  canonicalOverride: string | null | undefined,
  instanceOverride: string | null | undefined,
): string | null {
  if (instanceOverride != null) return instanceOverride;
  if (canonicalOverride != null) return canonicalOverride;
  if (polled != null) return polled;
  return null;
}
