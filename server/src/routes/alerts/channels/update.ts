import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { NotFoundError, ValidationError, sendErrorResponse } from '../../../utils/errors';
import { validateChannelUpdate, validateChannelCreate } from '../validation';
import { AlertChannelType } from '../../../db/types';

export function updateAlertChannel(req: Request, res: Response): void {
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

    const validated = validateChannelUpdate(req.body);

    // If config is updated without channel_type, validate against existing type
    if (validated.config && !validated.channel_type) {
      const configObj = JSON.parse(validated.config);
      const existingType = existing.channel_type as AlertChannelType;
      // Re-validate with the correct channel type
      const revalidated = validateChannelCreate({
        channel_type: existingType,
        config: configObj,
      });
      validated.config = revalidated.config;
    }

    const updated = stores.alertChannels.update(channelId, {
      channel_type: validated.channel_type,
      config: validated.config,
      is_active: validated.is_active,
    });

    if (!updated) {
      throw new NotFoundError('Alert channel');
    }

    res.json(updated);
  } catch (error) {
    sendErrorResponse(res, error, 'updating alert channel');
  }
}
