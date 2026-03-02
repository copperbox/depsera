import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { DependencyCanonicalOverride } from '../../db/types';
import {
  ICanonicalOverrideStore,
  CanonicalOverrideUpsertInput,
} from '../interfaces/ICanonicalOverrideStore';

export class CanonicalOverrideStore implements ICanonicalOverrideStore {
  constructor(private db: Database) {}

  findAll(teamId?: string): DependencyCanonicalOverride[] {
    if (teamId) {
      return this.db
        .prepare(
          'SELECT * FROM dependency_canonical_overrides WHERE team_id = ? ORDER BY canonical_name ASC'
        )
        .all(teamId) as DependencyCanonicalOverride[];
    }
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
        'SELECT * FROM dependency_canonical_overrides WHERE canonical_name = ? AND team_id IS NULL'
      )
      .get(canonicalName) as DependencyCanonicalOverride | undefined;
  }

  findByTeamAndCanonicalName(
    teamId: string,
    canonicalName: string
  ): DependencyCanonicalOverride | undefined {
    return this.db
      .prepare(
        'SELECT * FROM dependency_canonical_overrides WHERE team_id = ? AND canonical_name = ?'
      )
      .get(teamId, canonicalName) as DependencyCanonicalOverride | undefined;
  }

  findForHierarchy(
    canonicalName: string,
    teamId?: string
  ): DependencyCanonicalOverride | undefined {
    if (teamId) {
      const teamScoped = this.findByTeamAndCanonicalName(teamId, canonicalName);
      if (teamScoped) return teamScoped;
    }
    return this.findByCanonicalName(canonicalName);
  }

  upsert(input: CanonicalOverrideUpsertInput): DependencyCanonicalOverride {
    const id = randomUUID();
    const teamId = input.team_id ?? null;
    const manifestManaged = input.manifest_managed ?? 0;

    if (teamId) {
      // Team-scoped upsert: conflict on (team_id, canonical_name) WHERE team_id IS NOT NULL
      this.db
        .prepare(
          `INSERT INTO dependency_canonical_overrides
            (id, canonical_name, team_id, contact_override, impact_override, manifest_managed, created_at, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
          ON CONFLICT(team_id, canonical_name) WHERE team_id IS NOT NULL DO UPDATE SET
            contact_override = excluded.contact_override,
            impact_override = excluded.impact_override,
            manifest_managed = excluded.manifest_managed,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by`
        )
        .run(
          id,
          input.canonical_name,
          teamId,
          input.contact_override ?? null,
          input.impact_override ?? null,
          manifestManaged,
          input.updated_by
        );

      return this.findByTeamAndCanonicalName(teamId, input.canonical_name)!;
    } else {
      // Global upsert: conflict on (canonical_name) WHERE team_id IS NULL
      this.db
        .prepare(
          `INSERT INTO dependency_canonical_overrides
            (id, canonical_name, team_id, contact_override, impact_override, manifest_managed, created_at, updated_at, updated_by)
          VALUES (?, ?, NULL, ?, ?, ?, datetime('now'), datetime('now'), ?)
          ON CONFLICT(canonical_name) WHERE team_id IS NULL DO UPDATE SET
            contact_override = excluded.contact_override,
            impact_override = excluded.impact_override,
            manifest_managed = excluded.manifest_managed,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by`
        )
        .run(
          id,
          input.canonical_name,
          input.contact_override ?? null,
          input.impact_override ?? null,
          manifestManaged,
          input.updated_by
        );

      return this.findByCanonicalName(input.canonical_name)!;
    }
  }

  delete(canonicalName: string): boolean {
    const result = this.db
      .prepare(
        'DELETE FROM dependency_canonical_overrides WHERE canonical_name = ? AND team_id IS NULL'
      )
      .run(canonicalName);
    return result.changes > 0;
  }

  deleteByTeam(canonicalName: string, teamId: string): boolean {
    const result = this.db
      .prepare(
        'DELETE FROM dependency_canonical_overrides WHERE canonical_name = ? AND team_id = ?'
      )
      .run(canonicalName, teamId);
    return result.changes > 0;
  }
}
