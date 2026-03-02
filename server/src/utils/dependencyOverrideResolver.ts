/**
 * Resolves effective contact and impact for a list of dependencies
 * using the 4-tier override hierarchy:
 *   instance override > team canonical override > global canonical override > polled data
 *
 * Batch-fetches canonical overrides for efficiency.
 */

import { Dependency, DependencyCanonicalOverride } from '../db/types';
import { DependencyWithResolvedOverrides } from '../stores/types';
import { getStores } from '../stores';
import { resolveContact, resolveImpact } from './overrideResolver';

/**
 * Resolve effective contact and impact for each dependency using
 * the 4-tier merge hierarchy. Fetches all canonical overrides in a single
 * call and builds lookup maps for efficient resolution.
 *
 * When teamId is provided, team-scoped overrides take precedence over global.
 */
export function resolveDependencyOverrides(
  dependencies: Dependency[],
  teamId?: string,
): DependencyWithResolvedOverrides[] {
  const stores = getStores();
  const allCanonical = stores.canonicalOverrides.findAll();

  return resolveDependencyOverridesWithCanonical(dependencies, allCanonical, teamId);
}

/**
 * Pure resolution function that takes pre-fetched canonical overrides.
 * Useful for testing and for callers that already have the canonical data.
 *
 * When teamId is provided, the 4-tier hierarchy applies:
 *   instance override > team canonical override > global canonical override > polled data
 *
 * Without teamId, the original 3-tier hierarchy applies:
 *   instance override > global canonical override > polled data
 */
export function resolveDependencyOverridesWithCanonical(
  dependencies: Dependency[],
  canonicalOverrides: DependencyCanonicalOverride[],
  teamId?: string,
): DependencyWithResolvedOverrides[] {
  // Build separate maps for team-scoped and global overrides
  const globalMap = new Map<string, DependencyCanonicalOverride>();
  const teamMap = new Map<string, DependencyCanonicalOverride>();

  for (const o of canonicalOverrides) {
    if (o.team_id === null) {
      globalMap.set(o.canonical_name, o);
    } else if (teamId && o.team_id === teamId) {
      teamMap.set(o.canonical_name, o);
    }
  }

  return dependencies.map((dep) => {
    // Resolve canonical override: team-scoped first, then global fallback
    let canonical: DependencyCanonicalOverride | undefined;
    if (dep.canonical_name) {
      canonical = teamMap.get(dep.canonical_name) ?? globalMap.get(dep.canonical_name);
    }

    return {
      ...dep,
      effective_contact: resolveContact(
        dep.contact,
        canonical?.contact_override ?? null,
        dep.contact_override,
      ),
      effective_impact: resolveImpact(
        dep.impact,
        canonical?.impact_override ?? null,
        dep.impact_override,
      ),
    };
  });
}
