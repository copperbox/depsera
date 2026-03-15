import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { getStores } from '../stores';

// Extend Express Request type for API key auth
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKeyTeamId?: string;
    }
  }
}

/**
 * Middleware: authenticate requests via API key in Authorization header.
 * Expects `Authorization: Bearer dps_...` format.
 * Sets `req.apiKeyTeamId` on success, returns 401 if invalid.
 * Bypasses CSRF since collectors won't have CSRF tokens.
 */
export function requireApiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1].startsWith('dps_')) {
    res.status(401).json({ error: 'Invalid Authorization header format' });
    return;
  }

  const rawKey = parts[1];
  const keyHash = createHash('sha256').update(rawKey).digest('hex');

  const stores = getStores();
  const apiKey = stores.teamApiKeys.findByKeyHash(keyHash);

  if (!apiKey) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  req.apiKeyTeamId = apiKey.team_id;

  // Update last_used_at asynchronously (fire and forget)
  try {
    stores.teamApiKeys.updateLastUsed(apiKey.id);
  } catch {
    // Non-critical — don't fail the request
  }

  next();
}
