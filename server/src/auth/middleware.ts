import { Request, Response, NextFunction } from 'express';
import { getStores } from '../stores';
import { User, TeamMember } from '../db/types';

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

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  });
}

/**
 * Get team membership for a user
 */
function getTeamMembership(userId: string, teamId: string): TeamMember | undefined {
  const stores = getStores();
  return stores.teams.getMembership(teamId, userId);
}

/**
 * Middleware factory: require user to be a member of the specified team (or admin)
 * Team ID is extracted from req.params.id or req.params.teamId
 */
export function requireTeamAccess(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const user = req.user!;

    // Admins have access to all teams
    if (user.role === 'admin') {
      next();
      return;
    }

    const teamId = req.params.id || req.params.teamId;
    if (!teamId) {
      res.status(400).json({ error: 'Team ID required' });
      return;
    }

    const membership = getTeamMembership(user.id, teamId);
    if (!membership) {
      res.status(403).json({ error: 'Team access required' });
      return;
    }

    req.teamMembership = membership;
    next();
  });
}

/**
 * Middleware factory: require user to be a lead of the specified team (or admin)
 * Team ID is extracted from req.params.id or req.params.teamId
 */
export function requireTeamLead(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const user = req.user!;

    // Admins have full access
    if (user.role === 'admin') {
      next();
      return;
    }

    const teamId = req.params.id || req.params.teamId;
    if (!teamId) {
      res.status(400).json({ error: 'Team ID required' });
      return;
    }

    const membership = getTeamMembership(user.id, teamId);
    if (!membership || membership.role !== 'lead') {
      res.status(403).json({ error: 'Team lead access required' });
      return;
    }

    req.teamMembership = membership;
    next();
  });
}

/**
 * Middleware: require user to be a lead of the service's team (or admin)
 * Looks up the service from req.params.id to get the team_id
 */
export function requireServiceTeamLead(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const user = req.user!;

    // Admins have full access
    if (user.role === 'admin') {
      next();
      return;
    }

    const serviceId = req.params.id;
    if (!serviceId) {
      res.status(400).json({ error: 'Service ID required' });
      return;
    }

    // Look up the service to get its team_id
    const stores = getStores();
    const service = stores.services.findById(serviceId);

    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    const membership = getTeamMembership(user.id, service.team_id);
    if (!membership || membership.role !== 'lead') {
      res.status(403).json({ error: 'Team lead access required' });
      return;
    }

    req.teamMembership = membership;
    next();
  });
}

/**
 * Middleware: require user to be a lead of the team specified in request body (or admin)
 * Used for creating services where team_id comes from the request body
 */
export function requireBodyTeamLead(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const user = req.user!;

    // Admins have full access
    if (user.role === 'admin') {
      next();
      return;
    }

    const teamId = req.body?.team_id;
    if (!teamId) {
      res.status(400).json({ error: 'team_id required in request body' });
      return;
    }

    const membership = getTeamMembership(user.id, teamId);
    if (!membership || membership.role !== 'lead') {
      res.status(403).json({ error: 'Team lead access required' });
      return;
    }

    req.teamMembership = membership;
    next();
  });
}
