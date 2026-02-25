/**
 * Resolves effective contact and impact for a list of dependencies
 * using the 3-tier override hierarchy:
 *   instance override > canonical override > polled data
 *
 * Batch-fetches canonical overrides for efficiency.
 */

import { Dependency, DependencyCanonicalOverride } from '../db/types';
import { DependencyWithResolvedOverrides } from '../stores/types';
import { getStores } from '../stores';
import { resolveContact, resolveImpact } from './overrideResolver';

/**
 * Resolve effective contact and impact for each dependency using
 * the 3-tier merge hierarchy. Fetches canonical overrides in a single
 * call and builds a lookup map for efficient resolution.
 */
export function resolveDependencyOverrides(
  dependencies: Dependency[],
): DependencyWithResolvedOverrides[] {
  const stores = getStores();
  const allCanonical = stores.canonicalOverrides.findAll();

  return resolveDependencyOverridesWithCanonical(dependencies, allCanonical);
}

/**
 * Pure resolution function that takes pre-fetched canonical overrides.
 * Useful for testing and for callers that already have the canonical data.
 */
export function resolveDependencyOverridesWithCanonical(
  dependencies: Dependency[],
  canonicalOverrides: DependencyCanonicalOverride[],
): DependencyWithResolvedOverrides[] {
  const overrideMap = new Map(
    canonicalOverrides.map((o) => [o.canonical_name, o]),
  );

  return dependencies.map((dep) => {
    const canonical = dep.canonical_name
      ? overrideMap.get(dep.canonical_name)
      : undefined;

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
