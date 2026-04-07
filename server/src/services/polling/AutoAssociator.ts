import { Service, AssociationType, ProactiveDepsStatus } from '../../db/types';
import { StoreRegistry } from '../../stores';
import logger from '../../utils/logger';

/**
 * Automatically creates dependency_associations between trace-discovered
 * dependencies and registered services when a match is found.
 *
 * Matching strategy (exact only, no fuzzy):
 *   1. Case-insensitive name match against team services
 *   2. Canonical name resolution via DependencyAliasStore → match service name
 *
 * Skips self-links, already-associated pairs (including dismissed), and
 * catches UNIQUE constraint violations as no-ops for race-condition safety.
 */
export class AutoAssociator {
  constructor(private stores: StoreRegistry) {}

  /**
   * For each trace-discovered dependency owned by sourceService, attempt to
   * find a matching registered service and create an auto-suggested association.
   */
  processDiscoveredDependencies(
    sourceService: Service,
    dependencies: ProactiveDepsStatus[],
    teamId: string,
  ): void {
    if (dependencies.length === 0) return;

    const teamServices = this.stores.services.findByTeamId(teamId);
    const sourceDeps = this.stores.dependencies.findByServiceId(sourceService.id);

    for (const dep of dependencies) {
      try {
        // Look up the persisted dependency record by name
        const depRecord = sourceDeps.find(
          (d) => d.name.toLowerCase() === dep.name.toLowerCase(),
        );
        if (!depRecord) continue;

        // Find a matching registered service
        const targetService = this.findTargetService(
          dep.name,
          teamServices,
          depRecord.canonical_name,
        );
        if (!targetService) continue;

        // Skip self-links
        if (targetService.id === sourceService.id) continue;

        // Skip if any association already exists (including dismissed)
        if (this.stores.associations.existsForDependencyAndService(depRecord.id, targetService.id)) {
          continue;
        }

        const associationType = this.mapDependencyTypeToAssociationType(dep.type);

        this.stores.associations.create({
          dependency_id: depRecord.id,
          linked_service_id: targetService.id,
          association_type: associationType,
          is_auto_suggested: true,
        });
      } catch (err) {
        // Catch UNIQUE constraint violations as no-ops (race condition safety)
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('UNIQUE constraint failed')) {
          continue;
        }
        logger.warn({ err, depName: dep.name }, 'AutoAssociator: failed to process dependency');
      }
    }
  }

  /**
   * Find a registered service matching the dependency target name.
   *   1. Exact case-insensitive match on service name
   *   2. Resolve canonical name via alias store, then match service name
   */
  private findTargetService(
    depName: string,
    teamServices: Service[],
    canonicalName: string | null,
  ): Service | undefined {
    const depNameLower = depName.toLowerCase();

    // 1. Exact name match (case-insensitive)
    const exactMatch = teamServices.find(
      (s) => s.name.toLowerCase() === depNameLower,
    );
    if (exactMatch) return exactMatch;

    // 2. Canonical name match via alias resolution
    const resolvedCanonical = canonicalName ?? this.stores.aliases.resolveAlias(depName);
    if (resolvedCanonical) {
      const canonicalLower = resolvedCanonical.toLowerCase();
      const aliasMatch = teamServices.find(
        (s) => s.name.toLowerCase() === canonicalLower,
      );
      if (aliasMatch) return aliasMatch;
    }

    return undefined;
  }

  /**
   * Map dependency type strings to association type enum values.
   */
  private mapDependencyTypeToAssociationType(type?: string): AssociationType {
    switch (type) {
      case 'database':
        return 'database';
      case 'cache':
        return 'cache';
      case 'message_queue':
        return 'message_queue';
      case 'rest':
      case 'grpc':
        return 'api_call';
      default:
        return 'other';
    }
  }
}
