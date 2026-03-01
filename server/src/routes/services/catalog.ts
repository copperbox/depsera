import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { formatError, getErrorStatusCode } from '../../utils/errors';

/**
 * GET /api/services/catalog
 *
 * Cross-team service discovery endpoint. Returns minimal metadata for all
 * internal services so that any authenticated user can look up manifest keys
 * when authoring manifest associations.
 *
 * Query params:
 *   search  — case-insensitive substring filter on name / manifest_key
 *   team_id — restrict results to a single team
 */
export function listServiceCatalog(req: Request, res: Response): void {
  try {
    const { search, team_id } = req.query;
    const stores = getStores();

    const rows = stores.services.findAllWithTeam({
      isExternal: false,
      ...(team_id && typeof team_id === 'string' ? { teamId: team_id } : {}),
    });

    let entries = rows.map((row) => ({
      id: row.id,
      name: row.name,
      manifest_key: row.manifest_key ?? null,
      description: row.description ?? null,
      is_active: row.is_active,
      team_id: row.team_id,
      team_name: row.team_name,
    }));

    // In-memory text search on name and manifest_key
    if (search && typeof search === 'string') {
      const term = search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.name.toLowerCase().includes(term) ||
          (e.manifest_key && e.manifest_key.toLowerCase().includes(term)),
      );
    }

    res.json(entries);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    console.error('Error listing service catalog:', error);
    res.status(getErrorStatusCode(error)).json(formatError(error));
  }
}
