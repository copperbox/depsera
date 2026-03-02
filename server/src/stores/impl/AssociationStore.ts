import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { DependencyAssociation } from '../../db/types';
import { IAssociationStore } from '../interfaces/IAssociationStore';
import {
  AssociationWithService,
  AssociationListOptions,
  AssociationCreateInput,
} from '../types';

/**
 * Store implementation for DependencyAssociation entity operations
 */
export class AssociationStore implements IAssociationStore {
  constructor(private db: Database) {}

  findById(id: string): DependencyAssociation | undefined {
    return this.db
      .prepare('SELECT * FROM dependency_associations WHERE id = ?')
      .get(id) as DependencyAssociation | undefined;
  }

  findByDependencyId(dependencyId: string): DependencyAssociation[] {
    return this.db
      .prepare('SELECT * FROM dependency_associations WHERE dependency_id = ?')
      .all(dependencyId) as DependencyAssociation[];
  }

  findByDependencyIdWithService(dependencyId: string): AssociationWithService[] {
    return this.db
      .prepare(`
        SELECT
          da.*,
          s.name as linked_service_name,
          s.health_endpoint as linked_service_health_endpoint
        FROM dependency_associations da
        JOIN services s ON da.linked_service_id = s.id
        WHERE da.dependency_id = ?
      `)
      .all(dependencyId) as AssociationWithService[];
  }

  findByLinkedServiceId(linkedServiceId: string): DependencyAssociation[] {
    return this.db
      .prepare('SELECT * FROM dependency_associations WHERE linked_service_id = ?')
      .all(linkedServiceId) as DependencyAssociation[];
  }

  existsForDependencyAndService(dependencyId: string, linkedServiceId: string): boolean {
    const row = this.db
      .prepare(
        'SELECT 1 FROM dependency_associations WHERE dependency_id = ? AND linked_service_id = ?'
      )
      .get(dependencyId, linkedServiceId);
    return row !== undefined;
  }

  create(input: AssociationCreateInput): DependencyAssociation {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO dependency_associations (
          id, dependency_id, linked_service_id, association_type, manifest_managed, created_at
        ) VALUES (?, ?, ?, ?, 0, ?)
      `)
      .run(
        id,
        input.dependency_id,
        input.linked_service_id,
        input.association_type,
        now
      );

    return this.findById(id)!;
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM dependency_associations WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  deleteByDependencyId(dependencyId: string): number {
    const result = this.db
      .prepare('DELETE FROM dependency_associations WHERE dependency_id = ?')
      .run(dependencyId);
    return result.changes;
  }

  exists(id: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM dependency_associations WHERE id = ?')
      .get(id);
    return row !== undefined;
  }

  count(options?: AssociationListOptions): number {
    const { where, params } = this.buildWhereClause(options);
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM dependency_associations ${where}`)
      .get(...params) as { count: number };
    return row.count;
  }

  private buildWhereClause(options?: AssociationListOptions): {
    where: string;
    params: unknown[];
  } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.dependencyId) {
      conditions.push('dependency_id = ?');
      params.push(options.dependencyId);
    }

    if (options?.linkedServiceId) {
      conditions.push('linked_service_id = ?');
      params.push(options.linkedServiceId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
  }
}
