export type TeamMemberRole = 'lead' | 'member';

export interface Team {
  id: string;
  name: string;
  key: string | null;
  description: string | null;
  contact: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamWithCounts extends Team {
  member_count: number;
  service_count: number;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  role: TeamMemberRole;
  created_at: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    is_active: number;
  };
}

export interface TeamService {
  id: string;
  name: string;
  team_id: string;
  health_endpoint: string;
  metrics_endpoint: string | null;
  is_active: number;
  manifest_managed?: number;
  manifest_key?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamWithDetails extends Team {
  members: TeamMember[];
  services: TeamService[];
}

export interface CreateTeamInput {
  name: string;
  key: string;
  description?: string;
  contact?: string;
}

export interface UpdateTeamInput {
  name?: string;
  key?: string;
  description?: string;
  contact?: string;
}

export interface AddMemberInput {
  user_id: string;
  role?: TeamMemberRole;
}

export interface UpdateMemberInput {
  role: TeamMemberRole;
}
