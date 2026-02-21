import { Request, Response, NextFunction } from 'express';
import { getStores } from '../stores';
import { User, TeamMember } from '../db/types';
import { AuthorizationService } from './authorizationService';
import { getAuthMode } from './localAuth';

// Extend Express Request type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      teamMembership?: TeamMember;
    }
  }
}

/**
 * Middleware: require authenticated user
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const stores = getStores();
  const user = stores.users.findById(req.session.userId);

  if (!user || !user.is_active) {
    req.session.destroy(() => {});
    res.status(401).json({ error: 'User not found or inactive' });
    return;
  }

  req.user = user;
  next();
}

/**
 * Middleware: require admin role
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const result = AuthorizationService.checkAdminAccess(req.user!);
    if (!result.authorized) {
      res.status(result.statusCode!).json({ error: result.error });
      return;
    }
    next();
  });
}

/**
 * Middleware factory: require user to be a member of the specified team (or admin)
 * Team ID is extracted from req.params.id or req.params.teamId
 */
export function requireTeamAccess(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const teamId = req.params.id || req.params.teamId;
    if (!teamId) {
      res.status(400).json({ error: 'Team ID required' });
      return;
    }

    const result = AuthorizationService.checkTeamAccess(req.user!, teamId);
    if (!result.authorized) {
      res.status(result.statusCode!).json({ error: result.error });
      return;
    }

    if (result.membership) {
      req.teamMembership = result.membership;
    }
    next();
  });
}

/**
 * Middleware factory: require user to be a lead of the specified team (or admin)
 * Team ID is extracted from req.params.id or req.params.teamId
 */
export function requireTeamLead(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const teamId = req.params.id || req.params.teamId;
    if (!teamId) {
      res.status(400).json({ error: 'Team ID required' });
      return;
    }

    const result = AuthorizationService.checkTeamLeadAccess(req.user!, teamId);
    if (!result.authorized) {
      res.status(result.statusCode!).json({ error: result.error });
      return;
    }

    if (result.membership) {
      req.teamMembership = result.membership;
    }
    next();
  });
}

/**
 * Middleware: require user to be a member of the service's team (or admin)
 * Looks up the service from req.params.id to get the team_id
 */
export function requireServiceTeamAccess(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const serviceId = req.params.id;
    if (!serviceId) {
      res.status(400).json({ error: 'Service ID required' });
      return;
    }

    const result = AuthorizationService.checkServiceTeamAccess(req.user!, serviceId);
    if (!result.authorized) {
      res.status(result.statusCode!).json({ error: result.error });
      return;
    }

    if (result.membership) {
      req.teamMembership = result.membership;
    }
    next();
  });
}

/**
 * Middleware: require user to be a lead of the service's team (or admin)
 * Looks up the service from req.params.id to get the team_id
 */
export function requireServiceTeamLead(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const serviceId = req.params.id;
    if (!serviceId) {
      res.status(400).json({ error: 'Service ID required' });
      return;
    }

    const result = AuthorizationService.checkServiceTeamLeadAccess(req.user!, serviceId);
    if (!result.authorized) {
      res.status(result.statusCode!).json({ error: result.error });
      return;
    }

    if (result.membership) {
      req.teamMembership = result.membership;
    }
    next();
  });
}

/**
 * Middleware: require user to be a lead of the team specified in request body (or admin)
 * Used for creating services where team_id comes from the request body
 */
export function requireBodyTeamLead(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const teamId = req.body?.team_id;
    if (!teamId) {
      res.status(400).json({ error: 'team_id required in request body' });
      return;
    }

    const result = AuthorizationService.checkTeamLeadAccess(req.user!, teamId);
    if (!result.authorized) {
      res.status(result.statusCode!).json({ error: result.error });
      return;
    }

    if (result.membership) {
      req.teamMembership = result.membership;
    }
    next();
  });
}

/**
 * Middleware: require local auth mode.
 * Returns 404 if not in local auth mode. Must be used after requireAdmin.
 */
export function requireLocalAuth(_req: Request, res: Response, next: NextFunction): void {
  if (getAuthMode() !== 'local') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
}
