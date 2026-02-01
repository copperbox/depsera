import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { Dependency } from '../../db/types';
import {
  IDependencyStore,
  ExistingDependency,
  UpsertResult,
} from '../interfaces/IDependencyStore';
import {
  DependencyWithTarget,
  DependencyListOptions,
  DependencyUpsertInput,
  DependentReport,
} from '../types';

/**
 * Store implementation for Dependency entity operations
 */
export class DependencyStore implements IDependencyStore {
  constructor(private db: Database) {}

  findById(id: string): Dependency | undefined {
    return this.db
      .prepare('SELECT * FROM dependencies WHERE id = ?')
      .get(id) as Dependency | undefined;
  }

  findByServiceId(serviceId: string): Dependency[] {
    return this.db
      .prepare('SELECT * FROM dependencies WHERE service_id = ? ORDER BY name ASC')
      .all(serviceId) as Dependency[];
  }

  findByServiceIdWithTargets(serviceId: string): DependencyWithTarget[] {
    return this.db
      .prepare(`
        SELECT
          d.*,
          s.name as service_name,
          da.linked_service_id as target_service_id,
          da.association_type,
          da.is_auto_suggested,
          da.confidence_score,
          (
            SELECT ROUND(AVG(latency_ms))
            FROM dependency_latency_history
            WHERE dependency_id = d.id
              AND recorded_at >= datetime('now', '-24 hours')
          ) as avg_latency_24h
        FROM dependencies d
        JOIN services s ON d.service_id = s.id
        LEFT JOIN dependency_associations da ON d.id = da.dependency_id AND da.is_dismissed = 0
        WHERE d.service_id = ?
        ORDER BY d.name ASC
      `)
      .all(serviceId) as DependencyWithTarget[];
  }

  findAll(options?: DependencyListOptions): Dependency[] {
    const { where, params } = this.buildWhereClause(options);
    const orderBy = options?.orderBy || 'name';
    const orderDir = options?.orderDirection || 'ASC';

    let query = `SELECT * FROM dependencies ${where} ORDER BY ${orderBy} ${orderDir}`;

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }
    }

    return this.db.prepare(query).all(...params) as Dependency[];
  }

  findAllWithAssociationsAndLatency(options?: { activeServicesOnly?: boolean }): DependencyWithTarget[] {
    const activeFilter = options?.activeServicesOnly !== false ? 'WHERE s.is_active = 1' : '';

    return this.db
      .prepare(`
        SELECT
          d.*,
          d.check_details,
          d.error,
          d.error_message,
          s.name as service_name,
          da.linked_service_id as target_service_id,
          da.association_type,
          da.is_auto_suggested,
          da.confidence_score,
          (
            SELECT ROUND(AVG(latency_ms))
            FROM dependency_latency_history
            WHERE dependency_id = d.id
              AND recorded_at >= datetime('now', '-24 hours')
          ) as avg_latency_24h
        FROM dependencies d
        JOIN services s ON d.service_id = s.id
        LEFT JOIN dependency_associations da ON d.id = da.dependency_id AND da.is_dismissed = 0
        ${activeFilter}
      `)
      .all() as DependencyWithTarget[];
  }

  findByServiceIdsWithAssociationsAndLatency(serviceIds: string[]): DependencyWithTarget[] {
    if (serviceIds.length === 0) {
      return [];
    }

    const placeholders = serviceIds.map(() => '?').join(',');

    return this.db
      .prepare(`
        SELECT
          d.*,
          d.check_details,
          d.error,
          d.error_message,
          s.name as service_name,
          da.linked_service_id as target_service_id,
          da.association_type,
          da.is_auto_suggested,
          da.confidence_score,
          (
            SELECT ROUND(AVG(latency_ms))
            FROM dependency_latency_history
            WHERE dependency_id = d.id
              AND recorded_at >= datetime('now', '-24 hours')
          ) as avg_latency_24h
        FROM dependencies d
        JOIN services s ON d.service_id = s.id
        LEFT JOIN dependency_associations da ON d.id = da.dependency_id AND da.is_dismissed = 0
        WHERE d.service_id IN (${placeholders})
      `)
      .all(...serviceIds) as DependencyWithTarget[];
  }

  findExistingByServiceId(serviceId: string): ExistingDependency[] {
    return this.db
      .prepare('SELECT id, name, healthy FROM dependencies WHERE service_id = ?')
      .all(serviceId) as ExistingDependency[];
  }

  findDependentReports(serviceId: string): DependentReport[] {
    return this.db
      .prepare(`
        SELECT
          d.id as dependency_id,
          d.name as dependency_name,
          d.service_id as reporting_service_id,
          s.name as reporting_service_name,
          d.healthy,
          d.health_state,
          d.latency_ms,
          d.last_checked,
          d.impact
        FROM dependency_associations da
        JOIN dependencies d ON da.dependency_id = d.id
        JOIN services s ON d.service_id = s.id
        WHERE da.linked_service_id = ?
          AND da.is_dismissed = 0
          AND s.is_active = 1
        ORDER BY d.last_checked DESC
      `)
      .all(serviceId) as DependentReport[];
  }

  upsert(input: DependencyUpsertInput): UpsertResult {
    const now = new Date().toISOString();

    // Check if dependency already exists
    const existing = this.db
      .prepare('SELECT id, healthy FROM dependencies WHERE service_id = ? AND name = ?')
      .get(input.service_id, input.name) as { id: string; healthy: number | null } | undefined;

    const id = existing?.id || randomUUID();
    const isNew = !existing;
    const newHealthy = input.healthy ? 1 : 0;
    const healthChanged = existing !== undefined &&
      existing.healthy !== null &&
      existing.healthy !== newHealthy;

    const checkDetailsJson = input.check_details ? JSON.stringify(input.check_details) : null;
    const errorJson = input.error !== undefined ? JSON.stringify(input.error) : null;

    this.db
      .prepare(`
        INSERT INTO dependencies (
          id, service_id, name, canonical_name, description, impact, type,
          healthy, health_state, health_code, latency_ms,
          check_details, error, error_message,
          last_checked, last_status_change, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(service_id, name) DO UPDATE SET
          canonical_name = excluded.canonical_name,
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
      `)
      .run(
        id,
        input.service_id,
        input.name,
        input.canonical_name ?? null,
        input.description ?? null,
        input.impact ?? null,
        input.type ?? 'other',
        newHealthy,
        input.health_state,
        input.health_code,
        input.latency_ms,
        checkDetailsJson,
        errorJson,
        input.error_message ?? null,
        input.last_checked,
        now,
        now,
        now
      );

    const dependency = this.findById(id)!;

    return {
      dependency,
      isNew,
      healthChanged,
      previousHealthy: existing?.healthy ?? null,
    };
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM dependencies WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  deleteByServiceId(serviceId: string): number {
    const result = this.db
      .prepare('DELETE FROM dependencies WHERE service_id = ?')
      .run(serviceId);
    return result.changes;
  }

  exists(id: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM dependencies WHERE id = ?')
      .get(id);
    return row !== undefined;
  }

  count(options?: DependencyListOptions): number {
    const { where, params } = this.buildWhereClause(options);
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM dependencies ${where}`)
      .get(...params) as { count: number };
    return row.count;
  }

  private buildWhereClause(options?: DependencyListOptions): {
    where: string;
    params: unknown[];
  } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.serviceId) {
      conditions.push('service_id = ?');
      params.push(options.serviceId);
    }

    if (options?.healthy !== undefined) {
      conditions.push('healthy = ?');
      params.push(options.healthy ? 1 : 0);
    }

    if (options?.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
  }
}
