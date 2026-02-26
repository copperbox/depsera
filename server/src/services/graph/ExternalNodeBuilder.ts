import { createHash } from 'crypto';
import { DependencyType } from '../../db/types';
import { DependencyWithTarget, ServiceNodeData } from './types';

interface ExternalGroup {
  id: string;
  name: string;
  deps: DependencyWithTarget[];
}

/**
 * Builds virtual "External" nodes for unassociated dependencies
 * (dependencies with no target_service_id).
 */
export class ExternalNodeBuilder {
  /**
   * Normalize a dependency name for dedup grouping.
   */
  static normalizeDepName(name: string): string {
    return name.toLowerCase().trim();
  }

  /**
   * Generate a deterministic ID for an external node.
   */
  static generateExternalId(normalizedName: string): string {
    const hash = createHash('sha256').update(normalizedName).digest('hex').slice(0, 12);
    return `external-${hash}`;
  }

  /**
   * Group unassociated dependencies by normalized name.
   * Returns a map of normalized name → { id, display name, deps[] }.
   */
  static groupUnassociatedDeps(
    deps: DependencyWithTarget[]
  ): Map<string, ExternalGroup> {
    const groups = new Map<string, ExternalGroup>();

    for (const dep of deps) {
      if (dep.target_service_id !== null) continue;

      const displayName = dep.canonical_name ?? dep.name;
      const normalized = this.normalizeDepName(displayName);
      const existing = groups.get(normalized);

      if (existing) {
        existing.deps.push(dep);
      } else {
        groups.set(normalized, {
          id: this.generateExternalId(normalized),
          name: displayName,
          deps: [dep],
        });
      }
    }

    return groups;
  }

  /**
   * Build ServiceNodeData for an external node from grouped dependencies.
   */
  static buildNodeData(name: string, deps: DependencyWithTarget[]): ServiceNodeData {
    let healthyCount = 0;
    let unhealthyCount = 0;
    let skippedCount = 0;

    for (const dep of deps) {
      if (dep.skipped === 1) {
        skippedCount++;
      } else if (dep.healthy === 1) {
        healthyCount++;
      } else if (dep.healthy === 0) {
        unhealthyCount++;
      }
    }

    // Infer service type from most common dep type
    const typeCounts = new Map<DependencyType, number>();
    for (const dep of deps) {
      typeCounts.set(dep.type, (typeCounts.get(dep.type) || 0) + 1);
    }
    let serviceType: DependencyType | undefined;
    let maxCount = 0;
    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count;
        serviceType = type;
      }
    }

    return {
      name,
      teamId: 'external',
      teamName: 'External',
      healthEndpoint: '',
      isActive: true,
      dependencyCount: deps.length,
      healthyCount,
      unhealthyCount,
      lastPollSuccess: null,
      lastPollError: null,
      skippedCount,
      serviceType,
      isExternal: true,
    };
  }

  /**
   * Build a name-to-ID map for edge resolution.
   */
  static buildNameToIdMap(groups: Map<string, ExternalGroup>): Map<string, string> {
    const map = new Map<string, string>();
    for (const [normalizedName, group] of groups) {
      map.set(normalizedName, group.id);
    }
    return map;
  }
}
