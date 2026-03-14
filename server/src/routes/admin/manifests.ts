import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { ManifestSyncService } from '../../services/manifest/ManifestSyncService';
import { sendErrorResponse } from '../../utils/errors';

export function listManifests(_req: Request, res: Response): void {
  try {
    const stores = getStores();

    const teams = stores.teams.findAll();
    const configs = stores.manifestConfig.findAll();

    // Build per-config rows
    const entries = [];

    // Map team info
    const teamById = new Map(teams.map(t => [t.id, t]));

    for (const config of configs) {
      const team = teamById.get(config.team_id);
      if (!team) continue;

      let pending_drift_count = 0;
      const summary = stores.driftFlags.countByTeamId(config.team_id);
      pending_drift_count = summary.pending_count;

      entries.push({
        team_id: team.id,
        team_name: team.name,
        team_key: team.key,
        contact: team.contact,
        config_id: config.id,
        config_name: config.name,
        manifest_url: config.manifest_url,
        is_enabled: config.is_enabled === 1,
        last_sync_at: config.last_sync_at ?? null,
        last_sync_status: config.last_sync_status ?? null,
        last_sync_error: config.last_sync_error ?? null,
        last_sync_summary: config.last_sync_summary ?? null,
        pending_drift_count,
      });
    }

    // Also include teams without configs
    const teamsWithConfigs = new Set(configs.map(c => c.team_id));
    for (const team of teams) {
      if (!teamsWithConfigs.has(team.id)) {
        entries.push({
          team_id: team.id,
          team_name: team.name,
          team_key: team.key,
          contact: team.contact,
          config_id: null,
          config_name: null,
          manifest_url: null,
          is_enabled: false,
          last_sync_at: null,
          last_sync_status: null,
          last_sync_error: null,
          last_sync_summary: null,
          pending_drift_count: 0,
        });
      }
    }

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
    const teams = stores.teams.findAll();
    const teamById = new Map(teams.map(t => [t.id, t]));

    const results: { team_id: string; team_name: string; config_id: string; config_name: string; status: string; error?: string }[] = [];

    // Process sequentially to avoid SQLite contention
    for (const config of enabledConfigs) {
      const team = teamById.get(config.team_id);
      const teamName = team?.name ?? config.team_id;

      if (syncService.isSyncingConfig(config.id)) {
        results.push({
          team_id: config.team_id,
          team_name: teamName,
          config_id: config.id,
          config_name: config.name,
          status: 'skipped',
          error: 'Sync already in progress',
        });
        continue;
      }

      try {
        const result = await syncService.syncManifest(config.id, 'manual', null);
        results.push({
          team_id: config.team_id,
          team_name: teamName,
          config_id: config.id,
          config_name: config.name,
          status: result.status,
        });
      } catch (err) {
        results.push({
          team_id: config.team_id,
          team_name: teamName,
          config_id: config.id,
          config_name: config.name,
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
