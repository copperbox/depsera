import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { Service } from '../../db/types';
import { IServiceStore } from '../interfaces/IServiceStore';
import {
  ServiceWithTeam,
  ServiceListOptions,
  ServiceCreateInput,
  ServiceUpdateInput,
} from '../types';
import { validateOrderBy } from '../orderByValidator';

/** Allowed ORDER BY columns for services table queries */
const ALLOWED_COLUMNS = new Set([
  'name', 'team_id', 'health_endpoint', 'poll_interval_ms',
  'is_active', 'last_poll_success', 'created_at', 'updated_at',
]);

/** Allowed ORDER BY columns for services table queries with table alias */
const ALLOWED_COLUMNS_ALIASED = new Set([
  's.name', 's.team_id', 's.health_endpoint', 's.poll_interval_ms',
  's.is_active', 's.last_poll_success', 's.created_at', 's.updated_at',
]);

/**
 * Store implementation for Service entity operations
 */
export class ServiceStore implements IServiceStore {
  constructor(private db: Database) {}

  findById(id: string): Service | undefined {
    return this.db
      .prepare('SELECT * FROM services WHERE id = ?')
      .get(id) as Service | undefined;
  }

  findByIdWithTeam(id: string): ServiceWithTeam | undefined {
    return this.db
      .prepare(`
        SELECT
          s.*,
          t.name as team_name,
          t.description as team_description,
          t.created_at as team_created_at,
          t.updated_at as team_updated_at
        FROM services s
        JOIN teams t ON s.team_id = t.id
        WHERE s.id = ?
      `)
      .get(id) as ServiceWithTeam | undefined;
  }

  findAll(options?: ServiceListOptions): Service[] {
    const { where, params } = this.buildWhereClause(options);
    const { column: orderBy, direction: orderDir } = validateOrderBy(
      ALLOWED_COLUMNS, options?.orderBy, options?.orderDirection, 'name',
    );

    let query = `SELECT * FROM services ${where} ORDER BY ${orderBy} ${orderDir}`;

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }
    }

    return this.db.prepare(query).all(...params) as Service[];
  }

  findAllWithTeam(options?: ServiceListOptions): ServiceWithTeam[] {
    const { where, params } = this.buildWhereClause(options, 's');
    const { column: orderBy, direction: orderDir } = validateOrderBy(
      ALLOWED_COLUMNS_ALIASED, options?.orderBy, options?.orderDirection, 's.name',
    );

    let query = `
      SELECT
        s.*,
        t.name as team_name,
        t.description as team_description,
        t.created_at as team_created_at,
        t.updated_at as team_updated_at
      FROM services s
      JOIN teams t ON s.team_id = t.id
      ${where}
      ORDER BY ${orderBy} ${orderDir}
    `;

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
      if (options.offset) {
        query += ` OFFSET ${options.offset}`;
      }
    }

    return this.db.prepare(query).all(...params) as ServiceWithTeam[];
  }

  findActive(): Service[] {
    return this.findAll({ isActive: true });
  }

  findActiveWithTeam(): ServiceWithTeam[] {
    return this.findAllWithTeam({ isActive: true });
  }

  findByTeamId(teamId: string): Service[] {
    return this.findAll({ teamId });
  }

  create(input: ServiceCreateInput): Service {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint, metrics_endpoint, poll_interval_ms, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `)
      .run(
        id,
        input.name,
        input.team_id,
        input.health_endpoint,
        input.metrics_endpoint ?? null,
        input.poll_interval_ms ?? 30000,
        now,
        now
      );

    return this.findById(id)!;
  }

  update(id: string, input: ServiceUpdateInput): Service | undefined {
    const existing = this.findById(id);
    if (!existing) {
      return undefined;
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      params.push(input.name);
    }
    if (input.team_id !== undefined) {
      updates.push('team_id = ?');
      params.push(input.team_id);
    }
    if (input.health_endpoint !== undefined) {
      updates.push('health_endpoint = ?');
      params.push(input.health_endpoint);
    }
    if (input.metrics_endpoint !== undefined) {
      updates.push('metrics_endpoint = ?');
      params.push(input.metrics_endpoint);
    }
    if (input.poll_interval_ms !== undefined) {
      updates.push('poll_interval_ms = ?');
      params.push(input.poll_interval_ms);
    }
    /* istanbul ignore if -- is_active update tested via service routes */
    if (input.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(input.is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    this.db
      .prepare(`UPDATE services SET ${updates.join(', ')} WHERE id = ?`)
      .run(...params);

    return this.findById(id);
  }

  updatePollResult(serviceId: string, success: boolean, error?: string): void {
    this.db
      .prepare(`UPDATE services SET last_poll_success = ?, last_poll_error = ?, updated_at = ? WHERE id = ?`)
      .run(success ? 1 : 0, error ?? null, new Date().toISOString(), serviceId);
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM services WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  exists(id: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM services WHERE id = ?')
      .get(id);
    return row !== undefined;
  }

  count(options?: ServiceListOptions): number {
    const { where, params } = this.buildWhereClause(options);
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM services ${where}`)
      .get(...params) as { count: number };
    return row.count;
  }

  private buildWhereClause(
    options?: ServiceListOptions,
    tableAlias?: string
  ): { where: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    const prefix = tableAlias ? `${tableAlias}.` : '';

    if (options?.teamId) {
      conditions.push(`${prefix}team_id = ?`);
      params.push(options.teamId);
    } else if (options?.teamIds && options.teamIds.length > 0) {
      const placeholders = options.teamIds.map(() => '?').join(', ');
      conditions.push(`${prefix}team_id IN (${placeholders})`);
      params.push(...options.teamIds);
    }

    if (options?.isActive !== undefined) {
      conditions.push(`${prefix}is_active = ?`);
      params.push(options.isActive ? 1 : 0);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
  }
}
