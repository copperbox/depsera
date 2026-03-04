import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { sendErrorResponse } from '../../../utils/errors';
import { validateRulesUpdate } from '../validation';

export function updateAlertRules(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const stores = getStores();

    const validated = validateRulesUpdate(req.body);

    // Upsert: if the team has an existing rule, update it; otherwise create
    const existingRules = stores.alertRules.findByTeamId(teamId);

    let rule;
    if (existingRules.length > 0) {
      rule = stores.alertRules.update(existingRules[0].id, {
        severity_filter: validated.severity_filter,
        is_active: validated.is_active,
        use_custom_thresholds: validated.use_custom_thresholds,
        cooldown_minutes: validated.cooldown_minutes,
        rate_limit_per_hour: validated.rate_limit_per_hour,
        alert_delay_minutes: validated.alert_delay_minutes,
      });
    } else {
      rule = stores.alertRules.create({
        team_id: teamId,
        severity_filter: validated.severity_filter,
      });

      // Apply non-default fields immediately after creation
      const updates: Record<string, unknown> = {};
      if (!validated.is_active) updates.is_active = false;
      if (validated.use_custom_thresholds !== undefined) updates.use_custom_thresholds = validated.use_custom_thresholds;
      if (validated.cooldown_minutes !== undefined) updates.cooldown_minutes = validated.cooldown_minutes;
      if (validated.rate_limit_per_hour !== undefined) updates.rate_limit_per_hour = validated.rate_limit_per_hour;
      if (validated.alert_delay_minutes !== undefined) updates.alert_delay_minutes = validated.alert_delay_minutes;

      if (Object.keys(updates).length > 0) {
        rule = stores.alertRules.update(rule.id, updates);
      }
    }

    res.json(rule);
  } catch (error) {
    sendErrorResponse(res, error, 'updating alert rules');
  }
}
