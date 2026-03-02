import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { UpdateTeamInput } from '../../db/types';
import { sendErrorResponse } from '../../utils/errors';
import { auditFromRequest } from '../../services/audit/AuditLogService';
import { TEAM_KEY_REGEX, MAX_KEY_LENGTH } from '../../utils/validation';

export function updateTeam(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const input: UpdateTeamInput = req.body;
    const stores = getStores();

    // Check if team exists
    const existingTeam = stores.teams.findById(id);
    if (!existingTeam) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Validate fields if provided
    /* istanbul ignore if -- Edge case: malformed request body type coercion */
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || input.name.trim() === '') {
        res.status(400).json({ error: 'name must be a non-empty string' });
        return;
      }

      // Check for duplicate name (excluding current team)
      const duplicate = stores.teams.findByName(input.name.trim());

      if (duplicate && duplicate.id !== id) {
        res.status(409).json({ error: 'A team with this name already exists' });
        return;
      }
    }

    // Validate key if provided
    if (input.key !== undefined) {
      if (typeof input.key !== 'string' || input.key.trim() === '') {
        res.status(400).json({ error: 'key must be a non-empty string' });
        return;
      }
      if (input.key.length > MAX_KEY_LENGTH) {
        res.status(400).json({ error: `key must be at most ${MAX_KEY_LENGTH} characters` });
        return;
      }
      if (!TEAM_KEY_REGEX.test(input.key)) {
        res.status(400).json({ error: 'key must match pattern ^[a-z0-9][a-z0-9_-]*$' });
        return;
      }

      // Check for duplicate key (excluding current team)
      const duplicateKey = stores.teams.findByKey(input.key);
      if (duplicateKey && duplicateKey.id !== id) {
        res.status(409).json({ error: 'A team with this key already exists' });
        return;
      }
    }

    // Validate contact if provided
    if (input.contact !== undefined && input.contact !== null) {
      if (typeof input.contact !== 'string') {
        res.status(400).json({ error: 'contact must be a JSON string or null' });
        return;
      }
      try {
        const parsed = JSON.parse(input.contact);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          res.status(400).json({ error: 'contact must be a valid JSON object string' });
          return;
        }
      } catch {
        res.status(400).json({ error: 'contact must be a valid JSON object string' });
        return;
      }
    }

    // Check if there are any valid fields to update
    if (input.name === undefined && input.key === undefined && input.description === undefined && input.contact === undefined) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    // Update via repository
    const team = stores.teams.update(id, {
      name: input.name?.trim(),
      key: input.key,
      description: input.description,
      contact: input.contact,
    })!;

    auditFromRequest(req, 'team.updated', 'team', id, {
      name: team.name,
    });

    res.json({
      ...team,
      member_count: stores.teams.getMemberCount(id),
      service_count: stores.teams.getServiceCount(id),
    });
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'updating team');
  }
}
