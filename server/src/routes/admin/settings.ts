import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { SettingsService, isValidSettingsKey, SettingsKey } from '../../services/settings/SettingsService';
import { sendErrorResponse } from '../../utils/errors';
import { auditFromRequest } from '../../services/audit/AuditLogService';

function getSettingsService(): SettingsService {
  const stores = getStores();
  return SettingsService.getInstance(stores.settings);
}

export function getSettings(_req: Request, res: Response): void {
  try {
    const service = getSettingsService();
    const settings = service.getAll();
    res.json({ settings });
  } catch (error) /* istanbul ignore next -- Catch block for unexpected errors */ {
    sendErrorResponse(res, error, 'fetching settings');
  }
}

export function updateSettings(req: Request, res: Response): void {
  try {
    const updates = req.body;

    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      res.status(400).json({ error: 'Request body must be a JSON object of settings key-value pairs' });
      return;
    }

    // Filter to only known keys and validate
    const validUpdates: Partial<Record<SettingsKey, string | number>> = {};
    const unknownKeys: string[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (isValidSettingsKey(key)) {
        validUpdates[key] = value as string | number;
      } else {
        unknownKeys.push(key);
      }
    }

    if (Object.keys(validUpdates).length === 0) {
      res.status(400).json({
        error: 'No valid settings keys provided',
        ...(unknownKeys.length > 0 && { unknownKeys }),
      });
      return;
    }

    const service = getSettingsService();
    const userId = req.user!.id;
    const result = service.update(validUpdates, userId);

    // Audit the settings change
    auditFromRequest(
      req,
      'settings.updated',
      'settings',
      undefined,
      { updatedKeys: Object.keys(validUpdates) },
    );

    res.json({
      settings: service.getAll(),
      updated: result.length,
      ...(unknownKeys.length > 0 && { unknownKeys }),
    });
  } catch (error) {
    sendErrorResponse(res, error, 'updating settings');
  }
}
