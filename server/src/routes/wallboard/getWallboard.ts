import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { WallboardService } from '../../services/wallboard';
import { formatError, getErrorStatusCode } from '../../utils/errors';

export function getWallboard(req: Request, res: Response): void {
  try {
    const user = req.user!;
    const stores = getStores();
    const service = new WallboardService();

    let teamIds: string[] | undefined;

    if (user.role !== 'admin') {
      const memberships = stores.teams.getMembershipsByUserId(user.id);
      teamIds = memberships.map((m) => m.team_id);
      if (teamIds.length === 0) {
        res.json({ dependencies: [], teams: [] });
        return;
      }
    }

    const data = service.getWallboardData(teamIds);
    res.json(data);
  } catch (error) {
    res.status(getErrorStatusCode(error)).json(formatError(error));
  }
}
