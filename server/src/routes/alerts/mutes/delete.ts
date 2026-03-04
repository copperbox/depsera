import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { sendErrorResponse, NotFoundError } from '../../../utils/errors';

export function deleteAlertMute(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const muteId = req.params.muteId;
    const stores = getStores();
    const userId = req.user!.id;

    // Verify mute exists and belongs to team
    const mute = stores.alertMutes.findById(muteId);
    if (!mute) {
      throw new NotFoundError('Alert mute');
    }
    if (mute.team_id !== teamId) {
      res.status(403).json({ error: 'Mute does not belong to this team' });
      return;
    }

    stores.alertMutes.delete(muteId);

    // Audit log
    stores.auditLog.create({
      user_id: userId,
      action: 'alert_mute.deleted',
      resource_type: 'alert_mute',
      resource_id: muteId,
      details: JSON.stringify({
        team_id: teamId,
        dependency_id: mute.dependency_id,
        canonical_name: mute.canonical_name,
      }),
      ip_address: req.ip || null,
    });

    res.status(204).send();
  } catch (error) {
    sendErrorResponse(res, error, 'deleting alert mute');
  }
}
