import { randomUUID } from 'crypto';
import db from '../../db';
import { Service, ProactiveDepsStatus } from '../../db/types';
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

      return {
        name: dep.name as string,
        description: typeof dep.description === 'string' ? dep.description : undefined,
        impact: typeof dep.impact === 'string' ? dep.impact : undefined,
        healthy: dep.healthy as boolean,
        health: {
          state: healthState as 0 | 1 | 2,
          code: healthCode,
          latency,
        },
        lastChecked: typeof dep.lastChecked === 'string' ? dep.lastChecked : new Date().toISOString(),
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
        id, service_id, name, description, impact,
        healthy, health_state, health_code, latency_ms,
        last_checked, last_status_change, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(service_id, name) DO UPDATE SET
        description = excluded.description,
        impact = excluded.impact,
        healthy = excluded.healthy,
        health_state = excluded.health_state,
        health_code = excluded.health_code,
        latency_ms = excluded.latency_ms,
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

      upsertStmt.run(
        id,
        this.service.id,
        dep.name,
        dep.description || null,
        dep.impact || null,
        newHealthy,
        dep.health.state,
        dep.health.code,
        dep.health.latency,
        dep.lastChecked,
        now,
        now,
        now
      );

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
