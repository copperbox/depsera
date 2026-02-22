import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { NotFoundError, sendErrorResponse } from '../../../utils/errors';

export function deleteAlertChannel(req: Request, res: Response): void {
  try {
    const { id: teamId, channelId } = req.params;
    const stores = getStores();

    // Verify channel exists and belongs to this team
    const existing = stores.alertChannels.findById(channelId);
    if (!existing) {
      throw new NotFoundError('Alert channel');
    }
    if (existing.team_id !== teamId) {
      throw new NotFoundError('Alert channel');
    }

    stores.alertChannels.delete(channelId);
    res.status(204).send();
  } catch (error) {
    sendErrorResponse(res, error, 'deleting alert channel');
  }
}
