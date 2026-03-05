import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

export function listAdminAlertMutes(req: Request, res: Response): void {
  try {
    const stores = getStores();

    const limit = Math.min(Number(req.query.limit) || 50, 250);
    const offset = Number(req.query.offset) || 0;
    const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined;

    const mutes = stores.alertMutes.findAll({ limit, offset, teamId });
    const total = stores.alertMutes.countAll(teamId);

    // Enrich with dependency name, service name, creator name, and team name
    const enriched = mutes.map(mute => {
      let dependency_name: string | undefined;
      let service_name: string | undefined;

      if (mute.dependency_id) {
        const dep = stores.dependencies.findById(mute.dependency_id);
        if (dep) {
          dependency_name = dep.name;
          const svc = stores.services.findById(dep.service_id);
          service_name = svc?.name;
        }
      } else if (mute.service_id) {
        const svc = stores.services.findById(mute.service_id);
        service_name = svc?.name;
      }

      const created_by_name = stores.users.findById(mute.created_by)?.name;
      const team_name = stores.teams.findById(mute.team_id)?.name;

      return {
        ...mute,
        dependency_name,
        service_name,
        created_by_name,
        team_name,
      };
    });

    res.json({ mutes: enriched, total, limit, offset });
  } catch (error) {
    sendErrorResponse(res, error, 'listing admin alert mutes');
  }
}
