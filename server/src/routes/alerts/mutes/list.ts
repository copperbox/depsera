import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { sendErrorResponse } from '../../../utils/errors';

export function listAlertMutes(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const stores = getStores();

    const limit = Math.min(Number(req.query.limit) || 50, 250);
    const offset = Number(req.query.offset) || 0;

    const mutes = stores.alertMutes.findByTeamId(teamId, { limit, offset });
    const total = stores.alertMutes.countByTeamId(teamId);

    // Enrich with dependency name, service name, and creator name
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

      return {
        ...mute,
        dependency_name,
        service_name,
        created_by_name,
      };
    });

    res.json({ mutes: enriched, total, limit, offset });
  } catch (error) {
    sendErrorResponse(res, error, 'listing alert mutes');
  }
}
