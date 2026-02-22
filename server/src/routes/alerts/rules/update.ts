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
      });
    } else {
      rule = stores.alertRules.create({
        team_id: teamId,
        severity_filter: validated.severity_filter,
      });

      // If is_active was explicitly set to false, update immediately after creation
      if (!validated.is_active) {
        rule = stores.alertRules.update(rule.id, { is_active: false });
      }
    }

    res.json(rule);
  } catch (error) {
    sendErrorResponse(res, error, 'updating alert rules');
  }
}
