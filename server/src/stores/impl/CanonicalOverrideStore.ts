import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { DependencyCanonicalOverride } from '../../db/types';
import {
  ICanonicalOverrideStore,
  CanonicalOverrideUpsertInput,
} from '../interfaces/ICanonicalOverrideStore';

export class CanonicalOverrideStore implements ICanonicalOverrideStore {
  constructor(private db: Database) {}

  findAll(): DependencyCanonicalOverride[] {
    return this.db
      .prepare(
        'SELECT * FROM dependency_canonical_overrides ORDER BY canonical_name ASC'
      )
      .all() as DependencyCanonicalOverride[];
  }

  findByCanonicalName(
    canonicalName: string
  ): DependencyCanonicalOverride | undefined {
    return this.db
      .prepare(
        'SELECT * FROM dependency_canonical_overrides WHERE canonical_name = ?'
      )
      .get(canonicalName) as DependencyCanonicalOverride | undefined;
  }

  upsert(input: CanonicalOverrideUpsertInput): DependencyCanonicalOverride {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO dependency_canonical_overrides
          (id, canonical_name, contact_override, impact_override, created_at, updated_at, updated_by)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?)
        ON CONFLICT(canonical_name) DO UPDATE SET
          contact_override = excluded.contact_override,
          impact_override = excluded.impact_override,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by`
      )
      .run(
        id,
        input.canonical_name,
        input.contact_override ?? null,
        input.impact_override ?? null,
        input.updated_by
      );

    return this.findByCanonicalName(input.canonical_name)!;
  }

  delete(canonicalName: string): boolean {
    const result = this.db
      .prepare(
        'DELETE FROM dependency_canonical_overrides WHERE canonical_name = ?'
      )
      .run(canonicalName);
    return result.changes > 0;
  }
}
