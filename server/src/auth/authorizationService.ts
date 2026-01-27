import { getStores } from '../stores';
import { User, TeamMember } from '../db/types';

/**
 * Authorization check result
 */
export interface AuthorizationResult {
  authorized: boolean;
  membership?: TeamMember;
  error?: string;
  statusCode?: number;
}

/**
 * Authorization service for checking user permissions
 */
export class AuthorizationService {
  /**
   * Check if a user is a member of a team
   */
  static checkTeamMembership(userId: string, teamId: string): TeamMember | undefined {
    const stores = getStores();
    return stores.teams.getMembership(teamId, userId);
  }

  /**
   * Check if a user has access to a team (is a member or admin)
   */
  static checkTeamAccess(user: User, teamId: string): AuthorizationResult {
    // Admins have access to all teams
    if (user.role === 'admin') {
      return { authorized: true };
    }

    const membership = this.checkTeamMembership(user.id, teamId);
    if (!membership) {
      return {
        authorized: false,
        error: 'Team access required',
        statusCode: 403,
      };
    }

    return { authorized: true, membership };
  }

  /**
   * Check if a user is a lead of a team (or admin)
   */
  static checkTeamLeadAccess(user: User, teamId: string): AuthorizationResult {
    // Admins have full access
    if (user.role === 'admin') {
      return { authorized: true };
    }

    const membership = this.checkTeamMembership(user.id, teamId);
    if (!membership || membership.role !== 'lead') {
      return {
        authorized: false,
        error: 'Team lead access required',
        statusCode: 403,
      };
    }

    return { authorized: true, membership };
  }

  /**
   * Check if a user is a lead of a service's team (or admin)
   */
  static checkServiceTeamLeadAccess(user: User, serviceId: string): AuthorizationResult {
    // Admins have full access
    if (user.role === 'admin') {
      return { authorized: true };
    }

    // Look up the service to get its team_id
    const stores = getStores();
    const service = stores.services.findById(serviceId);

    if (!service) {
      return {
        authorized: false,
        error: 'Service not found',
        statusCode: 404,
      };
    }

    return this.checkTeamLeadAccess(user, service.team_id);
  }

  /**
   * Check if user is an admin
   */
  static checkAdminAccess(user: User): AuthorizationResult {
    if (user.role !== 'admin') {
      return {
        authorized: false,
        error: 'Admin access required',
        statusCode: 403,
      };
    }

    return { authorized: true };
  }
}
