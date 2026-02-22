export type UserRole = 'admin' | 'user';
export type TeamMemberRole = 'lead' | 'member';

export interface UserTeamMembership {
  team_id: string;
  role: TeamMemberRole;
  team: {
    id: string;
    name: string;
    description: string | null;
  };
}

export interface UserPermissions {
  canManageUsers: boolean;
  canManageTeams: boolean;
  canManageServices: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  teams?: UserTeamMembership[];
  permissions?: UserPermissions;
}
