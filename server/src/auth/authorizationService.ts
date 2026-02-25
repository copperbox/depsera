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
   * Check if a user has team access for a dependency's owning service (or is admin).
   * Looks up the dependency to find its service, then checks team membership.
   */
  static checkDependencyTeamAccess(user: User, dependencyId: string): AuthorizationResult {
    if (user.role === 'admin') {
      return { authorized: true };
    }

    const stores = getStores();
    const dependency = stores.dependencies.findById(dependencyId);

    if (!dependency) {
      return {
        authorized: false,
        error: 'Dependency not found',
        statusCode: 404,
      };
    }

    const service = stores.services.findById(dependency.service_id);

    if (!service) {
      return {
        authorized: false,
        error: 'Service not found',
        statusCode: 404,
      };
    }

    return this.checkTeamAccess(user, service.team_id);
  }

  /**
   * Check if a user has team access for a service (or is admin).
   */
  static checkServiceTeamAccess(user: User, serviceId: string): AuthorizationResult {
    if (user.role === 'admin') {
      return { authorized: true };
    }

    const stores = getStores();
    const service = stores.services.findById(serviceId);

    if (!service) {
      return {
        authorized: false,
        error: 'Service not found',
        statusCode: 404,
      };
    }

    return this.checkTeamAccess(user, service.team_id);
  }

  /**
   * Check if a user is a team lead of a dependency's owning service's team (or admin).
   * Used for per-instance override mutations.
   */
  static checkDependencyTeamLeadAccess(user: User, dependencyId: string): AuthorizationResult {
    if (user.role === 'admin') {
      return { authorized: true };
    }

    const stores = getStores();
    const dependency = stores.dependencies.findById(dependencyId);

    if (!dependency) {
      return {
        authorized: false,
        error: 'Dependency not found',
        statusCode: 404,
      };
    }

    const service = stores.services.findById(dependency.service_id);

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
   * Check if a user can manage a canonical override.
   * Authorized if admin OR team lead of any team that owns a service
   * with a dependency matching the given canonical name.
   */
  static checkCanonicalOverrideAccess(user: User, canonicalName: string): AuthorizationResult {
    if (user.role === 'admin') {
      return { authorized: true };
    }

    const stores = getStores();

    // Find all dependencies with this canonical_name
    const allDeps = stores.dependencies.findAll();
    const matchingDeps = allDeps.filter(d => d.canonical_name === canonicalName);

    // Get unique service IDs from matching dependencies
    const serviceIds = [...new Set(matchingDeps.map(d => d.service_id))];

    // Check if user is team lead of any team owning these services
    for (const serviceId of serviceIds) {
      const result = this.checkServiceTeamLeadAccess(user, serviceId);
      if (result.authorized) {
        return { authorized: true, membership: result.membership };
      }
    }

    return {
      authorized: false,
      error: 'Team lead access required for a team with a service reporting this dependency',
      statusCode: 403,
    };
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
