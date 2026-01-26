import { randomUUID } from 'crypto';
import db from '../../db';
import { Service, ProactiveDepsStatus, Dependency } from '../../db/types';
import { StatusChangeEvent } from './types';
import { ErrorHistoryRecorder, getErrorHistoryRecorder } from './ErrorHistoryRecorder';
import { AssociationMatcher } from '../matching';

interface ExistingDependency {
  id: string;
  name: string;
  healthy: number | null;
}

/**
 * Handles upserting dependencies from health endpoint responses.
 * Manages INSERT/UPDATE logic, status change detection, latency history, and suggestion generation.
 */
export class DependencyUpsertService {
  private errorRecorder: ErrorHistoryRecorder;

  constructor(errorRecorder?: ErrorHistoryRecorder) {
    this.errorRecorder = errorRecorder || getErrorHistoryRecorder();
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

    // Get existing dependencies to detect status changes
    const existingDeps = this.getExistingDependencies(service.id);
    const existingByName = new Map(existingDeps.map(d => [d.name, d]));

    const upsertStmt = this.prepareUpsertStatement();

    for (const dep of deps) {
      const existing = existingByName.get(dep.name);
      const newHealthy = dep.healthy ? 1 : 0;
      const isNew = !existing;

      // Detect status change
      if (existing && existing.healthy !== null && existing.healthy !== newHealthy) {
        changes.push({
          serviceId: service.id,
          serviceName: service.name,
          dependencyName: dep.name,
          previousHealthy: existing.healthy === 1,
          currentHealthy: dep.healthy,
          timestamp: now,
        });
      }

      const id = existing?.id || randomUUID();

      // Serialize JSON fields
      const checkDetailsJson = dep.checkDetails ? JSON.stringify(dep.checkDetails) : null;
      const errorJson = dep.error !== undefined ? JSON.stringify(dep.error) : null;

      // Upsert the dependency
      upsertStmt.run(
        id,
        service.id,
        dep.name,
        dep.description || null,
        dep.impact || null,
        dep.type || 'other',
        newHealthy,
        dep.health.state,
        dep.health.code,
        dep.health.latency,
        checkDetailsJson,
        errorJson,
        dep.errorMessage || null,
        dep.lastChecked,
        now,
        now,
        now
      );

      // Record error history with deduplication logic
      this.errorRecorder.record(id, dep.healthy, errorJson, dep.errorMessage || null, now);

      // Record latency history if latency is available
      if (dep.health.latency > 0) {
        this.recordLatencyHistory(id, dep.health.latency, now);
      }

      // Track new dependencies for suggestion generation
      if (isNew) {
        newDependencyIds.push(id);
      }
    }

    // Generate association suggestions for new dependencies
    this.generateSuggestions(newDependencyIds);

    return changes;
  }

  /**
   * Get existing dependencies for a service.
   */
  private getExistingDependencies(serviceId: string): ExistingDependency[] {
    return db.prepare(`
      SELECT id, name, healthy FROM dependencies WHERE service_id = ?
    `).all(serviceId) as ExistingDependency[];
  }

  /**
   * Prepare the upsert statement.
   */
  private prepareUpsertStatement() {
    return db.prepare(`
      INSERT INTO dependencies (
        id, service_id, name, description, impact, type,
        healthy, health_state, health_code, latency_ms,
        check_details, error, error_message,
        last_checked, last_status_change, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(service_id, name) DO UPDATE SET
        description = excluded.description,
        impact = excluded.impact,
        type = excluded.type,
        healthy = excluded.healthy,
        health_state = excluded.health_state,
        health_code = excluded.health_code,
        latency_ms = excluded.latency_ms,
        check_details = excluded.check_details,
        error = excluded.error,
        error_message = excluded.error_message,
        last_checked = excluded.last_checked,
        last_status_change = CASE
          WHEN dependencies.healthy IS NULL OR dependencies.healthy != excluded.healthy
          THEN excluded.last_status_change
          ELSE dependencies.last_status_change
        END,
        updated_at = excluded.updated_at
    `);
  }

  /**
   * Record a latency history entry.
   */
  private recordLatencyHistory(dependencyId: string, latencyMs: number, timestamp: string): void {
    db.prepare(`
      INSERT INTO dependency_latency_history (id, dependency_id, latency_ms, recorded_at)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), dependencyId, latencyMs, timestamp);
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
    } catch (error) {
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
