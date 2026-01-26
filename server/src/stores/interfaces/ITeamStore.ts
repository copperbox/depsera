import { Team, TeamMember, User, TeamMemberRole } from '../../db/types';
import { TeamCreateInput, TeamUpdateInput, TeamMemberListOptions } from '../types';

/**
 * Team member with user details joined
 */
export interface TeamMemberWithUser extends TeamMember {
  user_email: string;
  user_name: string;
}

/**
 * Team membership with team details joined
 */
export interface MembershipWithTeam {
  team_id: string;
  role: TeamMemberRole;
  team_name: string;
  team_description: string | null;
}

/**
 * Store interface for Team entity operations
 */
export interface ITeamStore {
  // Find operations
  findById(id: string): Team | undefined;
  findByName(name: string): Team | undefined;
  findAll(): Team[];

  // Write operations
  create(input: TeamCreateInput): Team;
  update(id: string, input: TeamUpdateInput): Team | undefined;
  delete(id: string): boolean;

  // Member operations
  findMembers(teamId: string, options?: TeamMemberListOptions): TeamMemberWithUser[];
  getMembership(teamId: string, userId: string): TeamMember | undefined;
  getMembershipsByUserId(userId: string): MembershipWithTeam[];
  addMember(teamId: string, userId: string, role: TeamMemberRole): TeamMember;
  removeMember(teamId: string, userId: string): boolean;
  removeAllMembershipsForUser(userId: string): number;
  updateMemberRole(teamId: string, userId: string, role: TeamMemberRole): boolean;
  isMember(teamId: string, userId: string): boolean;

  // Utility
  exists(id: string): boolean;
  count(): number;
  getMemberCount(teamId: string): number;
  getServiceCount(teamId: string): number;
}
