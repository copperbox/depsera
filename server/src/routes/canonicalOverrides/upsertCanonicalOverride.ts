import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { AuthorizationService } from '../../auth/authorizationService';
import { auditFromRequest } from '../../services/audit/AuditLogService';
import { sendErrorResponse } from '../../utils/errors';

export function upsertCanonicalOverride(req: Request, res: Response): void {
  try {
    const { canonicalName } = req.params;
    const { contact_override, impact_override } = req.body;

    // Validate: at least one override field must be provided
    if (contact_override === undefined && impact_override === undefined) {
      res.status(400).json({
        error: 'At least one of contact_override or impact_override must be provided',
      });
      return;
    }

    // Validate contact_override: must be an object or null if provided
    if (contact_override !== undefined && contact_override !== null) {
      if (typeof contact_override !== 'object' || Array.isArray(contact_override)) {
        res.status(400).json({
          error: 'contact_override must be an object or null',
        });
        return;
      }
    }

    // Validate impact_override: must be a string or null if provided
    if (impact_override !== undefined && impact_override !== null) {
      if (typeof impact_override !== 'string') {
        res.status(400).json({
          error: 'impact_override must be a string or null',
        });
        return;
      }
    }

    // Check permissions: admin or team lead of a team with a service reporting this canonical dep
    const authResult = AuthorizationService.checkCanonicalOverrideAccess(
      req.user!,
      canonicalName,
    );
    if (!authResult.authorized) {
      res.status(authResult.statusCode!).json({ error: authResult.error });
      return;
    }

    const stores = getStores();
    const override = stores.canonicalOverrides.upsert({
      canonical_name: canonicalName,
      contact_override:
        contact_override !== undefined
          ? contact_override === null
            ? null
            : JSON.stringify(contact_override)
          : undefined,
      impact_override: impact_override !== undefined ? impact_override : undefined,
      updated_by: req.user!.id,
    });

    auditFromRequest(req, 'canonical_override.upserted', 'canonical_override', canonicalName, {
      canonical_name: canonicalName,
      contact_override: contact_override !== undefined ? contact_override : undefined,
      impact_override: impact_override !== undefined ? impact_override : undefined,
    });

    res.json(override);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'upserting canonical override');
  }
}
