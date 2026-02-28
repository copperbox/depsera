import { DependencyCanonicalOverride } from '../../db/types';

export interface CanonicalOverrideUpsertInput {
  canonical_name: string;
  team_id?: string | null;
  contact_override?: string | null;
  impact_override?: string | null;
  manifest_managed?: number;
  updated_by: string;
}

export interface ICanonicalOverrideStore {
  /** Return all overrides, optionally filtered by team_id. */
  findAll(teamId?: string): DependencyCanonicalOverride[];

  /**
   * Find a global override by canonical name (team_id IS NULL).
   * For team-scoped lookup, use findByTeamAndCanonicalName.
   */
  findByCanonicalName(canonicalName: string): DependencyCanonicalOverride | undefined;

  /** Find a team-scoped override for a specific team and canonical name. */
  findByTeamAndCanonicalName(
    teamId: string,
    canonicalName: string,
  ): DependencyCanonicalOverride | undefined;

  /**
   * Resolve the best canonical override for the hierarchy:
   * team-scoped first, then global fallback.
   * Returns undefined if neither exists.
   */
  findForHierarchy(
    canonicalName: string,
    teamId?: string,
  ): DependencyCanonicalOverride | undefined;

  /** Create or update an override. team_id defaults to NULL (global). */
  upsert(input: CanonicalOverrideUpsertInput): DependencyCanonicalOverride;

  /** Delete a global override (team_id IS NULL). */
  delete(canonicalName: string): boolean;

  /** Delete a team-scoped override. */
  deleteByTeam(canonicalName: string, teamId: string): boolean;
}
