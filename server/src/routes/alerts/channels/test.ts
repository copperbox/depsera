import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { NotFoundError, sendErrorResponse } from '../../../utils/errors';
import { AlertService } from '../../../services/alerts';

export async function testAlertChannel(req: Request, res: Response): Promise<void> {
  try {
    const { id: teamId, channelId } = req.params;
    const stores = getStores();

    // Verify channel exists and belongs to this team
    const channel = stores.alertChannels.findById(channelId);
    if (!channel) {
      throw new NotFoundError('Alert channel');
    }
    if (channel.team_id !== teamId) {
      throw new NotFoundError('Alert channel');
    }

    const alertService = AlertService.getInstance();
    const result = await alertService.sendTestAlert(channel.channel_type, channel.config);

    res.json({
      success: result.success,
      error: result.error || null,
    });
  } catch (error) {
    sendErrorResponse(res, error, 'testing alert channel');
  }
}
