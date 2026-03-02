import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { formatError, getErrorStatusCode } from '../../utils/errors';
import { db } from '../../db';

interface TeamTuple {
  canonical_name: string;
  team_id: string;
  team_name: string;
  team_key: string | null;
}

interface UsageCount {
  canonical_name: string;
  count: number;
}

/**
 * GET /api/catalog/external-dependencies
 *
 * Returns all canonical dependency names that are NOT internal services,
 * along with which teams use them, descriptions (from global canonical
 * overrides), and aliases. Teams use this to look up existing canonical
 * names when editing their manifests.
 *
 * Query params:
 *   search — case-insensitive substring filter on canonical_name or alias
 */
export function listExternalDependencies(req: Request, res: Response): void {
  try {
    const { search } = req.query;
    const stores = getStores();

    // 1. Get all (canonical_name, team) tuples for external dependencies
    const teamTuples = db
      .prepare(
        `SELECT DISTINCT d.canonical_name, s.team_id, t.name AS team_name, t.key AS team_key
         FROM dependencies d
         JOIN services s ON d.service_id = s.id
         JOIN teams t ON s.team_id = t.id
         WHERE d.canonical_name IS NOT NULL
           AND d.canonical_name NOT IN (
             SELECT name FROM services WHERE is_external = 0
             UNION
             SELECT manifest_key FROM services WHERE is_external = 0 AND manifest_key IS NOT NULL
           )
         ORDER BY d.canonical_name ASC`,
      )
      .all() as TeamTuple[];

    // 2. Get usage counts per canonical name
    const usageCounts = db
      .prepare(
        `SELECT d.canonical_name, COUNT(*) AS count
         FROM dependencies d
         JOIN services s ON d.service_id = s.id
         WHERE d.canonical_name IS NOT NULL
           AND d.canonical_name NOT IN (
             SELECT name FROM services WHERE is_external = 0
             UNION
             SELECT manifest_key FROM services WHERE is_external = 0 AND manifest_key IS NOT NULL
           )
         GROUP BY d.canonical_name`,
      )
      .all() as UsageCount[];

    const countMap = new Map(usageCounts.map((r) => [r.canonical_name, r.count]));

    // 3. Build global override description map
    const allOverrides = stores.canonicalOverrides.findAll();
    const globalDescriptions = new Map<string, string | null>();
    for (const ov of allOverrides) {
      if (ov.team_id === null) {
        globalDescriptions.set(ov.canonical_name, ov.impact_override);
      }
    }

    // 4. Build alias map (canonical_name → aliases[])
    const allAliases = stores.aliases.findAll();
    const aliasMap = new Map<string, string[]>();
    for (const a of allAliases) {
      let list = aliasMap.get(a.canonical_name);
      if (!list) {
        list = [];
        aliasMap.set(a.canonical_name, list);
      }
      list.push(a.alias);
    }

    // 5. Group team tuples by canonical_name
    const grouped = new Map<
      string,
      { teams: { id: string; name: string; key: string | null }[] }
    >();
    for (const row of teamTuples) {
      let entry = grouped.get(row.canonical_name);
      if (!entry) {
        entry = { teams: [] };
        grouped.set(row.canonical_name, entry);
      }
      entry.teams.push({
        id: row.team_id,
        name: row.team_name,
        key: row.team_key,
      });
    }

    // 6. Assemble response
    let entries = Array.from(grouped.entries()).map(([canonicalName, data]) => ({
      canonical_name: canonicalName,
      description: globalDescriptions.get(canonicalName) ?? null,
      teams: data.teams,
      aliases: aliasMap.get(canonicalName) ?? [],
      usage_count: countMap.get(canonicalName) ?? 0,
    }));

    // 7. Optional search filter on canonical_name or aliases
    if (search && typeof search === 'string') {
      const term = search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.canonical_name.toLowerCase().includes(term) ||
          e.aliases.some((a) => a.toLowerCase().includes(term)),
      );
    }

    res.json(entries);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    console.error('Error listing external dependencies:', error);
    res.status(getErrorStatusCode(error)).json(formatError(error));
  }
}
