import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { sendErrorResponse, ValidationError } from '../../../utils/errors';
import { validateMuteCreate } from '../validation';
import { parseDuration } from '../../../utils/duration';

export function createAlertMute(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const stores = getStores();
    const userId = req.user!.id;

    const validated = validateMuteCreate(req.body);

    // If instance mute, verify dependency belongs to this team
    if (validated.dependency_id) {
      const dep = stores.dependencies.findById(validated.dependency_id);
      if (!dep) {
        throw new ValidationError('Dependency not found', 'dependency_id');
      }
      const service = stores.services.findById(dep.service_id);
      if (!service || service.team_id !== teamId) {
        throw new ValidationError('Dependency does not belong to this team', 'dependency_id');
      }
    }

    // Parse duration to expiry timestamp
    let expiresAt: string | null = null;
    if (validated.duration) {
      const expiryDate = parseDuration(validated.duration);
      expiresAt = expiryDate.toISOString();
    }

    const mute = stores.alertMutes.create({
      team_id: teamId,
      dependency_id: validated.dependency_id ?? null,
      canonical_name: validated.canonical_name ?? null,
      reason: validated.reason ?? null,
      created_by: userId,
      expires_at: expiresAt,
    });

    // Audit log
    stores.auditLog.create({
      user_id: userId,
      action: 'alert_mute.created',
      resource_type: 'alert_mute',
      resource_id: mute.id,
      details: JSON.stringify({
        team_id: teamId,
        dependency_id: validated.dependency_id,
        canonical_name: validated.canonical_name,
        duration: validated.duration,
        reason: validated.reason,
      }),
      ip_address: req.ip || null,
    });

    res.status(201).json(mute);
  } catch (error) {
    sendErrorResponse(res, error, 'creating alert mute');
  }
}
