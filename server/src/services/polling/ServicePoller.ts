import { randomUUID } from 'crypto';
import db from '../../db';
import { Service, ProactiveDepsStatus, DependencyType, DEPENDENCY_TYPES } from '../../db/types';
import { ExponentialBackoff } from './backoff';
import { PollResult, StatusChangeEvent } from './types';
import { AssociationMatcher } from '../matching';

const POLL_TIMEOUT_MS = 30000;

export class ServicePoller {
  private service: Service;
  private backoff: ExponentialBackoff;
  private consecutiveFailures = 0;

  constructor(service: Service) {
    this.service = service;
    this.backoff = new ExponentialBackoff();
  }

  get serviceName(): string {
    return this.service.name;
  }

  get serviceId(): string {
    return this.service.id;
  }

  async poll(): Promise<PollResult> {
    const startTime = Date.now();

    try {
      const deps = await this.fetchHealthEndpoint();
      const changes = this.upsertDependencies(deps);

      // Reset backoff on success
      this.backoff.reset();
      this.consecutiveFailures = 0;

      return {
        success: true,
        dependenciesUpdated: deps.length,
        statusChanges: changes,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      this.consecutiveFailures++;

      return {
        success: false,
        dependenciesUpdated: 0,
        statusChanges: [],
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startTime,
      };
    }
  }

  getNextPollDelay(): number {
    if (this.consecutiveFailures > 0) {
      return this.backoff.getNextDelay();
    }
    return this.service.polling_interval * 1000;
  }

  updateService(service: Service): void {
    this.service = service;
  }

  private async fetchHealthEndpoint(): Promise<ProactiveDepsStatus[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);

    try {
      const response = await fetch(this.service.health_endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Dependencies-Dashboard/1.0',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseResponse(data);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Records error history with deduplication.
   * - When unhealthy: only records if this is the first error after healthy, or if error changed
   * - When healthy: records a recovery entry if the last state was an error
   */
  private recordErrorHistory(
    dependencyId: string,
    isHealthy: boolean,
    errorJson: string | null,
    errorMessage: string | null,
    timestamp: string
  ): void {
    // Get the most recent error history entry for this dependency
    const lastEntry = db.prepare(`
      SELECT error, error_message
      FROM dependency_error_history
      WHERE dependency_id = ?
      ORDER BY recorded_at DESC
      LIMIT 1
    `).get(dependencyId) as { error: string | null; error_message: string | null } | undefined;

    if (isHealthy) {
      // If healthy and last entry was an error, record recovery
      if (lastEntry && lastEntry.error !== null) {
        db.prepare(`
          INSERT INTO dependency_error_history (id, dependency_id, error, error_message, recorded_at)
          VALUES (?, ?, NULL, NULL, ?)
        `).run(randomUUID(), dependencyId, timestamp);
      }
    } else if (errorJson !== null) {
      // Unhealthy with an error - check if we should record it
      const shouldRecord = !lastEntry || // No previous entry
        lastEntry.error === null || // Last entry was a recovery
        lastEntry.error !== errorJson; // Error object is different

      if (shouldRecord) {
        db.prepare(`
          INSERT INTO dependency_error_history (id, dependency_id, error, error_message, recorded_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(randomUUID(), dependencyId, errorJson, errorMessage, timestamp);
      }
    }
  }

  private parseResponse(data: unknown): ProactiveDepsStatus[] {
    if (!Array.isArray(data)) {
      throw new Error('Invalid response: expected array');
    }

    return data.map((item, index) => {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`Invalid dependency at index ${index}: expected object`);
      }

      const dep = item as Record<string, unknown>;

      if (typeof dep.name !== 'string') {
        throw new Error(`Invalid dependency at index ${index}: missing name`);
      }

      if (typeof dep.healthy !== 'boolean') {
        throw new Error(`Invalid dependency at index ${index}: missing healthy`);
      }

      // Handle both formats: nested health object or flat healthCode/latencyMs
      let healthState = 0;
      let healthCode = 200;
      let latency = 0;

      if (dep.health && typeof dep.health === 'object') {
        const health = dep.health as Record<string, unknown>;
        healthState = typeof health.state === 'number' ? health.state : 0;
        healthCode = typeof health.code === 'number' ? health.code : 200;
        latency = typeof health.latency === 'number' ? health.latency : 0;
      } else {
        // Flat format from mock-services
        healthCode = typeof dep.healthCode === 'number' ? dep.healthCode : 200;
        latency = typeof dep.latencyMs === 'number' ? dep.latencyMs : 0;
        // Derive state from healthy status
        healthState = dep.healthy ? 0 : 2;
      }

      // Parse type field, validate against allowed types
      let depType: DependencyType = 'other';
      if (typeof dep.type === 'string' && DEPENDENCY_TYPES.includes(dep.type as DependencyType)) {
        depType = dep.type as DependencyType;
      }

      // Parse checkDetails
      let checkDetails: Record<string, unknown> | undefined;
      if (dep.checkDetails && typeof dep.checkDetails === 'object') {
        checkDetails = dep.checkDetails as Record<string, unknown>;
      }

      // Parse error and errorMessage
      const error = dep.error !== undefined ? dep.error : undefined;
      const errorMessage = typeof dep.errorMessage === 'string' ? dep.errorMessage : undefined;

      return {
        name: dep.name as string,
        description: typeof dep.description === 'string' ? dep.description : undefined,
        impact: typeof dep.impact === 'string' ? dep.impact : undefined,
        type: depType,
        healthy: dep.healthy as boolean,
        health: {
          state: healthState as 0 | 1 | 2,
          code: healthCode,
          latency,
        },
        lastChecked: typeof dep.lastChecked === 'string' ? dep.lastChecked : new Date().toISOString(),
        checkDetails,
        error,
        errorMessage,
      };
    });
  }

  private upsertDependencies(deps: ProactiveDepsStatus[]): StatusChangeEvent[] {
    const changes: StatusChangeEvent[] = [];
    const newDependencyIds: string[] = [];
    const now = new Date().toISOString();

    // Get existing dependencies to detect status changes
    const existingDeps = db.prepare(`
      SELECT id, name, healthy FROM dependencies WHERE service_id = ?
    `).all(this.service.id) as { id: string; name: string; healthy: number | null }[];

    const existingByName = new Map(existingDeps.map(d => [d.name, d]));

    const upsertStmt = db.prepare(`
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

    for (const dep of deps) {
      const existing = existingByName.get(dep.name);
      const newHealthy = dep.healthy ? 1 : 0;
      const isNew = !existing;

      // Detect status change
      if (existing && existing.healthy !== null && existing.healthy !== newHealthy) {
        changes.push({
          serviceId: this.service.id,
          serviceName: this.service.name,
          dependencyName: dep.name,
          previousHealthy: existing.healthy === 1,
          currentHealthy: dep.healthy,
          timestamp: now,
        });
      }

      const id = existing?.id || randomUUID();

      // Serialize checkDetails and error to JSON strings
      const checkDetailsJson = dep.checkDetails ? JSON.stringify(dep.checkDetails) : null;
      const errorJson = dep.error !== undefined ? JSON.stringify(dep.error) : null;

      upsertStmt.run(
        id,
        this.service.id,
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
      this.recordErrorHistory(id, dep.healthy, errorJson, dep.errorMessage || null, now);

      // Record latency history if latency is available
      if (dep.health.latency > 0) {
        db.prepare(`
          INSERT INTO dependency_latency_history (id, dependency_id, latency_ms, recorded_at)
          VALUES (?, ?, ?, ?)
        `).run(randomUUID(), id, dep.health.latency, now);
      }

      // Track new dependencies for suggestion generation
      if (isNew) {
        newDependencyIds.push(id);
      }
    }

    // Generate association suggestions for new dependencies
    if (newDependencyIds.length > 0) {
      try {
        const matcher = AssociationMatcher.getInstance();
        for (const depId of newDependencyIds) {
          matcher.generateSuggestions(depId);
        }
      } catch (error) {
        // Don't fail the poll if suggestion generation fails
        console.error('[Matching] Error generating suggestions:', error);
      }
    }

    return changes;
  }
}
