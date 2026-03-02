import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { ManifestSyncService } from '../../services/manifest/ManifestSyncService';
import { sendErrorResponse } from '../../utils/errors';

export function listManifests(_req: Request, res: Response): void {
  try {
    const stores = getStores();

    const teams = stores.teams.findAll();
    const configs = stores.manifestConfig.findAll();
    const configByTeamId = new Map(configs.map(c => [c.team_id, c]));

    const entries = teams.map(team => {
      const config = configByTeamId.get(team.id);

      let pending_drift_count = 0;
      if (config) {
        const summary = stores.driftFlags.countByTeamId(team.id);
        pending_drift_count = summary.pending_count;
      }

      return {
        team_id: team.id,
        team_name: team.name,
        team_key: team.key,
        contact: team.contact,
        has_config: !!config,
        manifest_url: config?.manifest_url ?? null,
        is_enabled: config ? config.is_enabled === 1 : false,
        last_sync_at: config?.last_sync_at ?? null,
        last_sync_status: config?.last_sync_status ?? null,
        last_sync_error: config?.last_sync_error ?? null,
        last_sync_summary: config?.last_sync_summary ?? null,
        pending_drift_count,
      };
    });

    res.json(entries);
  } catch (error) {
    sendErrorResponse(res, error, 'listing manifest configs');
  }
}

export async function syncAllManifests(_req: Request, res: Response): Promise<void> {
  try {
    const stores = getStores();
    const syncService = ManifestSyncService.getInstance();

    const enabledConfigs = stores.manifestConfig.findAllEnabled();

    const results: { team_id: string; team_name: string; status: string; error?: string }[] = [];

    // Process sequentially to avoid SQLite contention
    for (const config of enabledConfigs) {
      const team = stores.teams.findById(config.team_id);
      const teamName = team?.name ?? config.team_id;

      if (syncService.isSyncing(config.team_id)) {
        results.push({ team_id: config.team_id, team_name: teamName, status: 'skipped', error: 'Sync already in progress' });
        continue;
      }

      try {
        const result = await syncService.syncTeam(config.team_id, 'manual', null);
        results.push({ team_id: config.team_id, team_name: teamName, status: result.status });
      } catch (err) {
        results.push({
          team_id: config.team_id,
          team_name: teamName,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    res.json({ results });
  } catch (error) {
    sendErrorResponse(res, error, 'syncing all manifests');
  }
}
