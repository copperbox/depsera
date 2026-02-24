import { getStores, StoreRegistry } from '../../stores';
import type { IDependencyStore, ILatencyHistoryStore, IDependencyAliasStore } from '../../stores/interfaces';
import { Service, ProactiveDepsStatus } from '../../db/types';
import { StatusChangeEvent } from './types';
import { ErrorHistoryRecorder, getErrorHistoryRecorder } from './ErrorHistoryRecorder';
import { AssociationMatcher } from '../matching';

/**
 * Handles upserting dependencies from health endpoint responses.
 * Manages INSERT/UPDATE logic, status change detection, latency history, and suggestion generation.
 */
export class DependencyUpsertService {
  private errorRecorder: ErrorHistoryRecorder;
  private dependencyStore: IDependencyStore;
  private latencyStore: ILatencyHistoryStore;
  private aliasStore: IDependencyAliasStore;

  constructor(errorRecorder?: ErrorHistoryRecorder, stores?: StoreRegistry) {
    const storeRegistry = stores || getStores();
    this.errorRecorder = errorRecorder || getErrorHistoryRecorder();
    this.dependencyStore = storeRegistry.dependencies;
    this.latencyStore = storeRegistry.latencyHistory;
    this.aliasStore = storeRegistry.aliases;
  }

  /**
   * Upsert dependencies for a service and return any status changes.
   * @param service - The service that owns these dependencies
   * @param deps - The parsed dependency statuses
   * @returns Array of status change events
   */
  upsert(service: Service, deps: ProactiveDepsStatus[]): StatusChangeEvent[] {
    const changes: StatusChangeEvent[] = [];
    const newDependencyIds: string[] = [];
    const now = new Date().toISOString();

    for (const dep of deps) {
      // Resolve alias to canonical name
      const canonicalName = this.aliasStore.resolveAlias(dep.name);

      // Upsert via store
      const result = this.dependencyStore.upsert({
        service_id: service.id,
        name: dep.name,
        canonical_name: canonicalName,
        description: dep.description ?? null,
        impact: dep.impact ?? null,
        type: dep.type ?? 'other',
        healthy: dep.healthy,
        health_state: dep.health.state,
        health_code: dep.health.code,
        latency_ms: dep.health.latency,
        contact: dep.contact,
        check_details: dep.checkDetails,
        error: dep.error,
        error_message: dep.errorMessage ?? null,
        last_checked: dep.lastChecked,
      });

      // Track status change
      if (result.healthChanged) {
        changes.push({
          serviceId: service.id,
          serviceName: service.name,
          dependencyName: dep.name,
          previousHealthy: result.previousHealthy === 1,
          currentHealthy: dep.healthy,
          timestamp: now,
        });
      }

      // Record error history with deduplication logic
      const errorJson = dep.error !== undefined ? JSON.stringify(dep.error) : null;
      this.errorRecorder.record(
        result.dependency.id,
        dep.healthy,
        errorJson,
        dep.errorMessage ?? null,
        now
      );

      // Record latency history if latency is available
      if (dep.health.latency > 0) {
        this.latencyStore.record(result.dependency.id, dep.health.latency, now);
      }

      // Track new dependencies for suggestion generation
      if (result.isNew) {
        newDependencyIds.push(result.dependency.id);
      }
    }

    // Generate association suggestions for new dependencies
    this.generateSuggestions(newDependencyIds);

    return changes;
  }

  /**
   * Generate association suggestions for new dependencies.
   */
  private generateSuggestions(dependencyIds: string[]): void {
    if (dependencyIds.length === 0) return;

    try {
      const matcher = AssociationMatcher.getInstance();
      for (const depId of dependencyIds) {
        matcher.generateSuggestions(depId);
      }
    } catch (error) /* istanbul ignore next -- Suggestion generation failure is non-critical */ {
      // Don't fail the upsert if suggestion generation fails
      console.error('[Matching] Error generating suggestions:', error);
    }
  }
}

/**
 * Singleton instance for convenience
 */
let upsertServiceInstance: DependencyUpsertService | null = null;

export function getDependencyUpsertService(): DependencyUpsertService {
  if (!upsertServiceInstance) {
    upsertServiceInstance = new DependencyUpsertService();
  }
  return upsertServiceInstance;
}
